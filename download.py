#!/usr/bin/env python3
import sys
import os
import http.client, urllib.request, urllib.parse, urllib.error, base64, json

def performOcr(fn):
    with open(fn, mode = 'rb') as file:
        body = file.read()

    params = urllib.parse.urlencode({
        'language': 'unk',
        'detectOrientation ': 'true',
    })

    headers = {
        'Content-Type': 'application/octet-stream',
        'Ocp-Apim-Subscription-Key': sys.argv[1],
    }

    conn = http.client.HTTPSConnection('westcentralus.api.cognitive.microsoft.com')
    conn.request("POST", "/vision/v1.0/ocr?%s" % params, body, headers)
    response = conn.getresponse()
    return json.loads(response.read())

def main():
    fn = sys.argv[2]
    data = performOcr(fn)

    fnx, ext = os.path.splitext(fn)
    with open(fnx + '.json', 'w') as outfile:
        json.dump(data, outfile, indent = 4)

if __name__ == '__main__':
    main()
