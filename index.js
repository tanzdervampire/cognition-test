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

const toBoundingBox = str => {
    const [x, y, width, height] = str.split(/,/);
    return { x, y, width, height };
};

const normalize = str => str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const findRoleBoundingBox = (data, _role) => {
    const role = normalize(_role);

    const candidates = toLines(data)
        .filter(line => {
            const text = normalize(toText(line));
            return text === role || levenshtein.get(text, role) <= 3;
        });

    if (candidates.length === 0) {
        console.log(`Found no role matching "${role}".`);
        return null;
    }

    // TODO FIXME Warn multiple matches

    return toBoundingBox(candidates[0].boundingBox);
};

const findNameForBoundingBox = (data, needle) => {
    const candidates = toLines(data)
        .filter(line => {
            const current = toBoundingBox(line.boundingBox);
            return (Math.abs(needle.y - current.y) <= 10) && (needle.x !== current.x);
        });

    if (candidates.length === 0) {
        console.error(`Found no name for boundingBox = ${JSON.stringify(needle)}`);
        return null;
    }

    if (candidates.length > 1) {
        console.log(`Found ${candidates.length} matches for ${JSON.stringify(needle)}`);
    }

    return toText(candidates[0]);
};

const processData = data => {
    console.log('=== RAW DATA ===');
    console.log(JSON.stringify(data));
    console.log('=== END RAW DATA ===');

    const roles = [
        'Graf von Krolock',
        'Sarah',
        'Alfred',
        'Professor Abronsius',
        'Chagal',
        'Magda',
        'Herbert',
        'Rebecca',
        'Koukol',
    ];

    roles.forEach(role => {
        const bb = findRoleBoundingBox(data, role);
        if (!bb) {
            return;
        }

        const person = findNameForBoundingBox(data, bb);
        console.log(`${role} = ${person}`);
    });
};


const staticData = {"language":"de","textAngle":0,"orientation":"Up","regions":[{"boundingBox":"266,93,186,235","lines":[{"boundingBox":"318,93,70,15","words":[{"boundingBox":"318,93,38,15","text":"TANZ"},{"boundingBox":"360,93,28,15","text":"DER"}]},{"boundingBox":"304,216,102,13","words":[{"boundingBox":"304,216,29,13","text":"DAS"},{"boundingBox":"338,216,68,13","text":"MUSICAL"}]},{"boundingBox":"266,247,186,17","words":[{"boundingBox":"266,247,76,17","text":"Sonntag,"},{"boundingBox":"349,247,23,13","text":"15."},{"boundingBox":"379,247,28,13","text":"Mai"},{"boundingBox":"413,247,39,13","text":"2016"}]},{"boundingBox":"317,269,81,14","words":[{"boundingBox":"317,269,44,14","text":"14:30"},{"boundingBox":"367,270,31,13","text":"Uhr"}]},{"boundingBox":"315,312,90,16","words":[{"boundingBox":"315,312,90,16","text":"Besetzunq"}]}]},{"boundingBox":"206,342,147,155","lines":[{"boundingBox":"232,342,119,12","words":[{"boundingBox":"232,342,31,12","text":"Graf"},{"boundingBox":"266,345,26,9","text":"von"},{"boundingBox":"297,342,54,12","text":"Krolock"}]},{"boundingBox":"311,360,40,12","words":[{"boundingBox":"311,360,40,12","text":"Sarah"}]},{"boundingBox":"309,378,42,12","words":[{"boundingBox":"309,378,42,12","text":"Alfred"}]},{"boundingBox":"206,396,145,12","words":[{"boundingBox":"206,396,70,12","text":"Professor"},{"boundingBox":"279,396,72,12","text":"Abronsius"}]},{"boundingBox":"303,414,49,14","words":[{"boundingBox":"303,414,49,14","text":"Chagal"}]},{"boundingBox":"305,432,47,14","words":[{"boundingBox":"305,432,47,14","text":"Magda"}]},{"boundingBox":"300,450,53,11","words":[{"boundingBox":"300,450,53,11","text":"Herbert"}]},{"boundingBox":"292,468,61,11","words":[{"boundingBox":"292,468,61,11","text":"Rebecca"}]},{"boundingBox":"303,485,50,12","words":[{"boundingBox":"303,485,50,12","text":"Koukol"}]}]},{"boundingBox":"368,342,157,155","lines":[{"boundingBox":"368,342,78,15","words":[{"boundingBox":"368,342,27,12","text":"Kirill"},{"boundingBox":"400,342,46,15","text":"Zoygin"}]},{"boundingBox":"368,360,120,14","words":[{"boundingBox":"368,361,58,11","text":"Veronica"},{"boundingBox":"430,360,58,14","text":"Appeddu"}]},{"boundingBox":"368,378,112,12","words":[{"boundingBox":"368,378,30,12","text":"Tom"},{"boundingBox":"402,381,23,9","text":"van"},{"boundingBox":"429,378,22,12","text":"der"},{"boundingBox":"455,378,25,11","text":"Ven"}]},{"boundingBox":"368,396,101,12","words":[{"boundingBox":"368,396,39,12","text":"Victor"},{"boundingBox":"411,396,58,12","text":"Petersen"}]},{"boundingBox":"369,414,109,12","words":[{"boundingBox":"369,414,48,12","text":"Nicolas"},{"boundingBox":"421,414,57,11","text":"Tenerani"}]},{"boundingBox":"370,432,94,11","words":[{"boundingBox":"370,432,36,11","text":"Merel"},{"boundingBox":"410,432,54,11","text":"Zeeman"}]},{"boundingBox":"370,449,155,14","words":[{"boundingBox":"370,450,35,11","text":"Milan"},{"boundingBox":"409,452,23,9","text":"van"},{"boundingBox":"436,449,89,14","text":"Waardenburg"}]},{"boundingBox":"370,467,100,12","words":[{"boundingBox":"370,467,49,12","text":"Yvonne"},{"boundingBox":"424,467,46,12","text":"Köstler"}]},{"boundingBox":"370,485,86,12","words":[{"boundingBox":"370,485,38,12","text":"Paolo"},{"boundingBox":"412,485,44,11","text":"Bianca"}]}]},{"boundingBox":"120,511,493,373","lines":[{"boundingBox":"307,511,110,14","words":[{"boundingBox":"307,511,110,14","text":"Tanzsolisten"}]},{"boundingBox":"223,543,280,15","words":[{"boundingBox":"223,544,43,12","text":"Stefan"},{"boundingBox":"271,544,58,14","text":"Mosonyi."},{"boundingBox":"334,543,32,12","text":"Måté"},{"boundingBox":"370,543,50,15","text":"Gyenei,"},{"boundingBox":"425,543,34,12","text":"Katie"},{"boundingBox":"462,543,41,14","text":"Allday"}]},{"boundingBox":"290,568,146,16","words":[{"boundingBox":"290,568,146,16","text":"Gesangssolisten"}]},{"boundingBox":"237,600,254,14","words":[{"boundingBox":"237,602,48,12","text":"Sander"},{"boundingBox":"288,604,24,9","text":"van"},{"boundingBox":"316,601,53,13","text":"Wissen,"},{"boundingBox":"375,600,50,12","text":"Michael"},{"boundingBox":"429,600,62,12","text":"Anzalone"}]},{"boundingBox":"301,631,126,19","words":[{"boundingBox":"301,631,126,19","text":"Tenzensemble"}]},{"boundingBox":"184,669,360,16","words":[{"boundingBox":"184,672,24,12","text":"Joe"},{"boundingBox":"213,671,42,13","text":"Nolan."},{"boundingBox":"259,671,30,12","text":"Alex"},{"boundingBox":"293,670,38,15","text":"Hyne,"},{"boundingBox":"336,670,41,12","text":"Nicola"},{"boundingBox":"381,669,44,14","text":"Trazzi,"},{"boundingBox":"429,669,59,12","text":"Veronika"},{"boundingBox":"493,669,51,13","text":"Enders."}]},{"boundingBox":"230,687,269,16","words":[{"boundingBox":"230,689,38,13","text":"Astrid"},{"boundingBox":"273,689,47,13","text":"Gollob,"},{"boundingBox":"324,688,32,12","text":"Vicki"},{"boundingBox":"361,688,58,15","text":"Douglas,"},{"boundingBox":"424,687,40,12","text":"Nicole"},{"boundingBox":"469,687,30,12","text":"Ollio"}]},{"boundingBox":"284,717,162,18","words":[{"boundingBox":"284,717,162,18","text":"Gesanqsensemble"}]},{"boundingBox":"166,753,398,16","words":[{"boundingBox":"166,757,51,12","text":"Torsten"},{"boundingBox":"221,756,48,13","text":"Ankert,"},{"boundingBox":"274,755,35,12","text":"Noah"},{"boundingBox":"313,755,29,13","text":"Wili,"},{"boundingBox":"347,754,45,12","text":"Pascal"},{"boundingBox":"397,753,53,16","text":"Höwing,"},{"boundingBox":"455,753,45,12","text":"Marina"},{"boundingBox":"505,753,59,15","text":"Maniglio,"}]},{"boundingBox":"129,771,471,21","words":[{"boundingBox":"129,776,31,16","text":"Anja"},{"boundingBox":"164,775,63,14","text":"Wendzel,"},{"boundingBox":"232,774,68,13","text":"Samantha"},{"boundingBox":"305,773,100,15","text":"Harris-Hughes,"},{"boundingBox":"411,772,34,12","text":"Fleur"},{"boundingBox":"448,772,47,14","text":"Alders,"},{"boundingBox":"500,771,50,12","text":"Pamela"},{"boundingBox":"554,771,46,12","text":"Zottele"}]},{"boundingBox":"332,798,70,18","words":[{"boundingBox":"332,798,70,18","text":"Diriqent"}]},{"boundingBox":"326,828,82,15","words":[{"boundingBox":"326,828,34,15","text":"Shay"},{"boundingBox":"364,828,44,12","text":"Cohen"}]},{"boundingBox":"120,859,493,25","words":[{"boundingBox":"120,865,22,15","text":"Es"},{"boundingBox":"148,864,49,20","text":"spielt"},{"boundingBox":"203,864,32,15","text":"das"},{"boundingBox":"240,863,89,15","text":"Orchester"},{"boundingBox":"334,861,32,16","text":"des"},{"boundingBox":"372,861,50,19","text":"Stage"},{"boundingBox":"428,860,67,16","text":"Theater"},{"boundingBox":"500,859,32,15","text":"des"},{"boundingBox":"537,859,76,15","text":"Westens"}]}]}]};

(async () => {
    // TODO FIXME
    //return processData(staticData);

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
