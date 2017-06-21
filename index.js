require('dotenv').config()

const fs = require('fs');
const fetch = require('node-fetch');
const levenshtein = require('fast-levenshtein');

const toLines = data => {
    return data.regions
        .map(region => region.lines)
        .reduce((a, b) => [...a, ...b]);
};

const toText = line => line.words.map(w => w.text).join(' ');

const toBoundingBox = obj => {
    const [x, y, width, height] = obj.boundingBox.split(/,/);
    return { x, y, width, height };
};

const normalize = str => str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const doesLineMatch = (_line, _str) => {
    const line = normalize(toText(_line));
    const str = normalize(_str);

    return line === str || levenshtein.get(line, str) <= 3;
};

const doesLineMatchAny = (line, arr) => arr.some(str => doesLineMatch(line, str));

const findLineForRole = (data, role) => {
    const candidates = toLines(data)
        .filter(line => doesLineMatch(line, role));

    if (candidates.length !== 1) {
        console.log(`Found no unique line matching "${role}".`);
        return null;
    }

    return candidates[0];
};

const MatchFn = {
    MAIN: (data, hay, needle) => {
        const hayBox = toBoundingBox(hay);
        const needleBox = toBoundingBox(needle);

        /* They must be more or less on the same spot on the Y axis, but the X axis value must differ. */
        return (Math.abs(hayBox.y - needleBox.y) <= 10) && (hayBox.x !== needleBox.x);
    },

    SECONDARY: (data, hay, needle) => {
        /* Get headings and sort them. */
        const headings = [...toLines(data)]
            .filter(line => {
                return doesLineMatchAny(line, ['Tanzsolisten', 'Gesangssolisten', 'Tanzensemble', 'Gesangsensemble', 'Dirigent']);
            })
            .sort((a, b) => {
                const boxA = toBoundingBox(a);
                const boxB = toBoundingBox(b);
                return boxA.y - boxB.y;
            });

        const i = headings.map(h => h.boundingBox).indexOf(hay.boundingBox);
        const hayBox = toBoundingBox(hay);
        const needleBox = toBoundingBox(needle);

        return (needleBox.y > hayBox.y) && (
            (i === headings.length - 1) || (needleBox.y < toBoundingBox(headings[i+1]).y)
        );
    },
};

const findNamesForRoleLine = (data, hay, matchFn) => {
    return toLines(data)
        .filter(line => matchFn(data, hay, line))
        .map(toText)
        .map(text => text.split(/\s*[,.]\s*/))
        .reduce((a,b) => [...a, ...b])
        .filter(name => name.trim().length !== 0);
};

const findPersons = (data, role, multiple = false) => {
    const hay = findLineForRole(data, role);
    if (!hay) {
        return;
    }

    return findNamesForRoleLine(data, hay, multiple ? MatchFn.SECONDARY : MatchFn.MAIN);
};

const processData = data => {
    console.log('=== RAW DATA ===');
    console.log(JSON.stringify(data));
    console.log('=== END RAW DATA ===');

    const cast = {
        'Graf von Krolock': findPersons(data, 'Graf von Krolock'),
        'Sarah': findPersons(data, 'Sarah'),
        'Alfred': findPersons(data, 'Alfred'),
        'Professor Abronsius': findPersons(data, 'Professor Abronsius'),
        'Chagal': findPersons(data, 'Chagal'),
        'Magda': findPersons(data, 'Magda'),
        'Herbert': findPersons(data, 'Herbert'),
        'Rebecca': findPersons(data, 'Rebecca'),
        'Koukol': findPersons(data, 'Koukol'),
        'Tanzsolisten': findPersons(data, 'Tanzsolisten', true),
        'Gesangssolisten': findPersons(data, 'Gesangssolisten', true),
        'Tanzensemble': findPersons(data, 'Tanzensemble', true),
        'Gesangsensemble': findPersons(data, 'Gesangsensemble', true),
        'Dirigent': findPersons(data, 'Dirigent', true),
    };

    console.log('');

    console.log('=== CAST ===');
    console.log(JSON.stringify(cast, null, 4));
    console.log('=== END CAST ===');

    // TODO FIXME match names
};

(async () => {
    const fn = process.argv[2];
    //const body = fs.readFileSync(fn);
    const body = fs.createReadStream(fn);

    fetch(`${process.env.API_ENDPOINT}?language=de&detectOrientation=true`, {
        method: 'POST',
        accept: 'application/json',
        headers: {
            'Content-Type': 'application/octet-stream',
            'Ocp-Apim-Subscription-Key': process.env.API_KEY,
        },
        body,
    }).then(response => {
        return response.json();
    }).then(data => {
        processData(data);
    }).catch(err => console.log(JSON.stringify(err, null, 4)));
})();
