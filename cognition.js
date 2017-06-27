require('dotenv').config()

const fetch = require('node-fetch');
const levenshtein = require('fast-levenshtein');

// TODO FIXME Sometimes role + name get caught in the same fragment. Account for that.

const FragmentType = {
    UNKNOWN: 0,
    ROLE: 1,
    NAME: 2,
    OTHER: 3,
};

const Role = {
    'Graf von Krolock': { synonyms: [], isMainCast: true, singular: true },
    'Sarah': { synonyms: [], isMainCast: true, singular: true },
    'Alfred': { synonyms: [], isMainCast: true, singular: true },
    'Professor Abronsius': { synonyms: ['Prof. Abronsius'], isMainCast: true, singular: true },
    'Chagal': { synonyms: [], isMainCast: true, singular: true },
    'Magda': { synonyms: [], isMainCast: true, singular: true },
    'Herbert': { synonyms: [], isMainCast: true, singular: true },
    'Rebecca': { synonyms: [], isMainCast: true, singular: true },
    'Koukol': { synonyms: [], isMainCast: true, singular: true },
    'Tanzsolisten': { synonyms: ['Solotänzer'], isMainCast: false, singular: false },
    'Gesangssolisten': { synonyms: [], isMainCast: false, singular: false },
    'Tanzensemble': { synonyms: [], isMainCast: false, singular: false },
    'Gesangsensemble': { synonyms: [], isMainCast: false, singular: false },
    'Dirigent': { synonyms: [], isMainCast: false, singular: true },
};

const executeOcr = (stream, key) => {
    const url = `https://westcentralus.api.cognitive.microsoft.com/vision/v1.0/ocr?language=de&detectOrientation=true`;
    const params = {
        method: 'POST',
        accept: 'application/json',
        headers: {
            'Content-Type': 'application/octet-stream',
            'Ocp-Apim-Subscription-Key': key,
        },
        body: stream,
    };

    return fetch(url, params)
        .then(response => response.json());
};

const fetchRoleToPersons = () => {
    const url = `http://localhost:3001/api/roles`;
    const params = {
        method: 'GET',
        accept: 'application/json',
    };

    return fetch(url, params)
        .then(response => response.json());
};

const explodeBoundingBox = obj => {
    const [x, y, width, height] = obj.boundingBox.split(/,/).map(str => +str);
    return { x, y, width, height };
};

const mergeWords = words => words.map(word => word.text).join(' ');

const convertFragment = fragment => {
    const boundingBox = explodeBoundingBox(fragment);
    const text = mergeWords(fragment.words);
    return { boundingBox, text };
};

const enrichFragment = fragment => {
    return Object.assign({}, fragment, {
        type: FragmentType.UNKNOWN,
        role: undefined,
    });
};

const sortByX = (left, right) => left.boundingBox.x - right.boundingBox.x;
const sortByY = (left, right) => left.boundingBox.y - right.boundingBox.y;

const convertAverageFragmentHeight = fragments => {
    const sum = fragments
        .map(fragment => fragment.boundingBox.height)
        .reduce((a, b) => a + b, 0);
    return sum / fragments.length;
};

const getGroupByLineReducer = fragments => {
    const averageFragmentHeight = convertAverageFragmentHeight(fragments);
    const getBucket = y => Math.floor(y / averageFragmentHeight);

    return (accumulated, fragment) => {
        let bucket = getBucket(fragment.boundingBox.y);

        /* If the bucket doesn't yet exist, but the previous bucket does and has only a single entry,
         * check if that other fragment and this one appear to be on roughly the same line. If they
         * are, put them together.
         * This counteracts the hard cut-off in the calculation of the bucket itself. */
        if (!accumulated[bucket] && bucket - 1 >= 0  && accumulated[bucket - 1]
            && accumulated[bucket - 1].length === 1
            && Math.abs(accumulated[bucket - 1][0].boundingBox.y - fragment.boundingBox.y) <= averageFragmentHeight / 2) {

            bucket--;
        }

        (accumulated[bucket] = accumulated[bucket] || []).push(fragment);
        return accumulated;
    };
};

const flatten = (x, y) => [...x, ...y];

/**
 * Returns an array of arrays of objects of the following schema:
 *
 *  {
 *      boundingBox: { x: Number, y: Number, width: Number, height: Number },
 *      text: String,
 *      type: FragmentType,
 *      role?: String,
 *  }
 *
 * The array itself is sorted on the y-axis from top (y = 0) to bottom (y = max).
 *
 * Each sub-array represents a line after grouping them by their y-value based on
 * the average fragment height. The fragments inside the sub-arrays are sorted by
 * their x-value.
 */
const convertOcrResponse = response => {
    if (!response.regions) {
        return [];
    }

    const fragments = response.regions
        /* We are not interested in regions, so remove them. */
        .map(region => region.lines)
        /* Flatten the resulting array to get an array of fragments. */
        .reduce(flatten, [])
        /* Transform each fragment into something easier to handle… */
        .map(convertFragment)
        /* … and add some of our own properties. */
        .map(enrichFragment);

    const data = [...fragments]
        /* Sort by y-value so the following reducer always goes top to bottom. */
        .sort(sortByY)
        /* Calculate the types of each fragment. */
        .map(assignType)
        /* Group fragments into lines by buckets. */
        .reduce(getGroupByLineReducer(fragments), [])
        /* Remove lines that hold no fragment. */
        .filter(line => line)
        /* Sort fragments within a line by x-value. */
        .map(line => [...line].sort(sortByX));

    return data
        .filter(getHeaderFilter(data));
};

const normalize = str => {
    return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[.\/\\]/, '')
        .replace(/[\u0300-\u036f]/g, '');
};

const matches = (a, b) => {
    const left = normalize(a);
    const right = normalize(b);
    return levenshtein.get(left, right) <= 3;
};

const matchesAny = (str, roles) => roles.some(role => matches(str, role));

const assignType = fragment => {
    const name = fragment.text;

    /* Rule out some noise. */
    if (matchesAny(name, ['Tanz der', 'Vampire', 'Musical'])) {
        fragment.type = FragmentType.OTHER;
    }

    Object.keys(Role).forEach(role => {
        if (fragment.type) {
            return;
        }

        if (matchesAny(name, [role, ...Role[role].synonyms])) {
            fragment.type = FragmentType.ROLE;
            fragment.role = role;
        }
    });

    /* If we haven't found anything else, assume it's a name or list of names. */
    if (!fragment.type) {
        fragment.type = FragmentType.NAME;
    }

    return fragment;
};

const matchName = (name, candidates) => {
    const diffs = candidates
        .map(current => {
            return { name: current, distance: levenshtein.get(current, name) };
        })
        .sort((a, b) => a.distance - b.distance);

    return diffs[0].name;
};

const matchNames = (str, candidates) => {
    return str
        .split(/\s*[.,]\s*/)
        .filter(name => name && name.trim().length !== 0)
        .map(name => matchName(name, candidates))
        .filter(name => name);
};

const getHeaderFilter = data => {
    const roleLines = data
        .filter(line => line.some(fragment => fragment.type === FragmentType.ROLE));
    const first = (roleLines.length !== 0 && roleLines[0].length !== 0) ? roleLines[0][0] : null;

    return line => {
        return !first || line.some(fragment => fragment.boundingBox.y >= first.boundingBox.y);
    };
};

const lineToAverageY = line => {
    return line
        .map(fragment => fragment.boundingBox.y + 0.5 * fragment.boundingBox.height)
        .reduce((avg, y, _, all) => avg + y / all.length, 0);
};

/**
 * Returns the median spacing on the y-axis between name fragments.
 *
 */
const getMedianLineSpacing = data => {
    const spaces = data
        /* We are only interested in name fragments. */
        .map(line => line.filter(fragment => fragment.type === FragmentType.NAME))
        /* Filter out lines that no longer contain a fragment. */
        .filter(line => line)
        /* Average the y-coordinate of the fragments per line. */
        .map(lineToAverageY)
        /* Now subtract each coordinate from its successor. */
        .map((y, i, all) => y - (all[i-1] || y))
        /* Remove the first entry as it will always be 0. */
        .filter((_, i) => i !== 0)
        /* Sort the differences */
        .sort((a, b) => a - b);

    const middle = Math.floor(spaces.length / 2);
    return spaces.length % 2 === 0
        ? (spaces[middle - 1] + spaces[middle]) / 2
        : spaces[middle];
};

// TODO FIXME Refactor this.
const extractCast = (data, roleToPersons) => {
    const findMainCast = role => {
        const lines = data
            .filter(line => line.some(fragment => fragment.role === role));

        if (lines.length === 0) {
            return [];
        }

        const roleFragment = lines[0]
            .filter(fragment => fragment.role === role)
            [0];

        return lines[0]
            /* We are only interested in names. */
            .filter(fragment => fragment.type === FragmentType.NAME)
            /* Make sure the name is reasonably close to the role fragment. */
            .filter(fragment => {
                return fragment.boundingBox.x <= roleFragment.boundingBox.y + 1.5 * roleFragment.boundingBox.width;
            });
    };

    const findSecondaryCast = role => {
        const secondaryRoles = Object.keys(Role).filter(role => !Role[role].isMainCast);
        const medianLineSpacing = getMedianLineSpacing(data);

        let foundRoleFragment = false;
        let foundNextRoleFragment = false;
        let exceededSpacing = false;
        const lines = data
            /* First we filter lines between role fragments as much as we can. */
            .filter(line => {
                foundNextRoleFragment |= foundRoleFragment
                    && line.some(fragment => fragment.role && secondaryRoles.includes(fragment.role));
                foundRoleFragment |= line.some(fragment => fragment.role === role);
                return foundRoleFragment && !foundNextRoleFragment;
            })
            /* Now we also pay attention to line spacing as the next role fragment may not have been recognized. */
            .filter((line, i, all) => {
                /* We always take the first two lines since it includes the role fragment, but sometimes
                 * the conductor appears on the same line so we need to keep it. For the other cases the
                 * second line is the first line of name fragments. */
                if (i === 0 || i === 1) {
                    return true;
                }

                const last = lineToAverageY(all[i - 1]);
                const current = lineToAverageY(line);
                exceededSpacing |= Math.abs(last - current) > 2 * medianLineSpacing;
                return !exceededSpacing;
            });

        if (lines.length === 0) {
            return [];
        }

        const roleFragment = lines[0]
            .filter(fragment => fragment.role === role)
            [0];

        return lines
            .reduce(flatten, [])
            .filter(fragment => fragment.type === FragmentType.NAME)
            /* Make sure to only catch fragments reasonably close to the role fragment. */
            .filter(fragment => {
                const centerRoleFragment = roleFragment.boundingBox.x + roleFragment.boundingBox.width / 2;
                const centerFragment = fragment.boundingBox.x + fragment.boundingBox.width / 2;
                return Math.abs(centerRoleFragment - centerFragment) <= 1.5 * roleFragment.boundingBox.width;
            });
    };

    return Object.keys(Role).map(role => {
        const candidates = roleToPersons
            .filter(obj => obj.role === role)
            [0]
            .persons
            .map(person => person.name);

        const nameFragments = Role[role].isMainCast ? findMainCast(role) : findSecondaryCast(role);
        const names = nameFragments
            .map(fragment => matchNames(fragment.text, candidates))
            .reduce(flatten, [])
            .filter((name, i, all) => all.indexOf(name) === i)
            .filter((name, i) => !Role[role].singular || i === 0 );

        return { role, names };
    });
};

module.exports = { executeOcr, fetchRoleToPersons, convertOcrResponse, extractCast };
