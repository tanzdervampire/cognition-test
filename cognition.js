require('dotenv').config()

const fs = require('fs');
const fetch = require('node-fetch');
const levenshtein = require('fast-levenshtein');

const FragmentType = {
    UNKNOWN: 0,
    ROLE: 1,
    NAME: 2,
    OTHER: 3,
};

const Role = {
    'Graf von Krolock': { synonyms: [], isMainCast: true, },
    'Sarah': { synonyms: [], isMainCast: true, },
    'Alfred': { synonyms: [], isMainCast: true, },
    'Professor Abronsius': { synonyms: ['Prof. Abronsius'], isMainCast: true, },
    'Chagal': { synonyms: [], isMainCast: true, },
    'Magda': { synonyms: [], isMainCast: true, },
    'Herbert': { synonyms: [], isMainCast: true, },
    'Rebecca': { synonyms: [], isMainCast: true, },
    'Koukol': { synonyms: [], isMainCast: true, },
    'Tanzsolisten': { synonyms: ['Solotänzer'], isMainCast: false, },
    'Gesangssolisten': { synonyms: [], isMainCast: false, },
    'Tanzensemble': { synonyms: [], isMainCast: false, },
    'Gesangsensemble': { synonyms: [], isMainCast: false, },
    'Dirigent': { synonyms: [], isMainCast: false, },
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

    return (accumulated, obj) => {
        let bucket = getBucket(obj.boundingBox.y);

        /* If the bucket doesn't yet exist, but the previous bucket does and has only a single entry,
         * check if that other fragment and this one appear to be on roughly the same line. If they
         * are, put them together.
         * This counteracts the hard cut-off in the calculation of the bucket itself. */
        if (!accumulated[bucket] && bucket - 1 >= 0  && accumulated[bucket - 1]
            && accumulated[bucket - 1].length === 1
            && Math.abs(accumulated[bucket - 1][0].boundingBox.y - obj.boundingBox.y) <= averageFragmentHeight / 2) {

            bucket--;
        }

        (accumulated[bucket] = accumulated[bucket] || []).push(obj);
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
    // TODO FIXME Extract fragment type detection
    Object.keys(Role).forEach(role => {
        // TODO FIXME Take synonyms into account
        if (!fragment.type && matches(name, role)) {
            fragment.type = FragmentType.ROLE;
            fragment.role = role;
        }
    });

    // TODO FIXME Recognize Role.OTHER
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
    const first = data
        .filter(line => line.some(fragment => fragment.type === FragmentType.ROLE))
        [0][0];

    return line => {
        return line.some(fragment => fragment.boundingBox.y >= first.boundingBox.y);
    };
};

const extractCast = (data, roleToPersons) => {
    const findMainCast = role => {
        const lines = data
            .filter(line => line.some(fragment => fragment.role === role));

        if (lines.length === 0) {
            return [];
        }

        // TODO FIXME Filter by center points being …?
        const fragments = lines[0]
            .filter(fragment => fragment.type === FragmentType.NAME);
        if (fragments.length === 0) {
            return [];
        }

        const candidates = roleToPersons
            .filter(obj => obj.role === role)
            [0]
            .persons
            .map(person => person.name);

        return fragments
            .map(fragment => matchNames(fragment.text, candidates))
            .reduce(flatten, []);
    };

    const findSecondaryCast = role => {
    };

    // TODO FIXME Remove anything before first of "Besetzung", "Graf von Krolock", …

    return Object.keys(Role).map(role => {
        const names = Role[role].isMainCast ? findMainCast(role) : findSecondaryCast(role);
        return { role, names };
    });
};

const main = async () => {
    const fn = process.argv[2];
    const stream = fs.createReadStream(fn);

    const [ ocrResponse, roleToPersons ] = await Promise.all([
        executeOcr(stream, process.env.API_KEY),
        fetchRoleToPersons(),
    ]);

    const data = convertOcrResponse(ocrResponse);
    const cast = extractCast(data, roleToPersons);

    console.log(JSON.stringify(data, null, 4));
    console.log(JSON.stringify(cast, null, 4));
};

main()
    .then(() => console.log('Done!'))
    .catch(err => console.error(err));
