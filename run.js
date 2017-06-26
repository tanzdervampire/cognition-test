const fs = require('fs');
const cognition = require('./cognition');

const main = async () => {
    const fn = process.argv[2];
    const stream = fs.createReadStream(fn);

    const [ ocrResponse, roleToPersons ] = await Promise.all([
        cognition.executeOcr(stream, process.env.API_KEY),
        cognition.fetchRoleToPersons(),
    ]);

    const data = cognition.convertOcrResponse(ocrResponse);
    const cast = cognition.extractCast(data, roleToPersons);

    console.log(JSON.stringify(data, null, 4));
    console.log(JSON.stringify(cast, null, 4));
};

main()
    .then(() => console.log('Done!'))
    .catch(err => console.error(err));
