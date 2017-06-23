#!/usr/bin/env python3
import sys
import os
import http.client, urllib.request, urllib.parse, urllib.error, base64, json
from PIL import Image, ImageDraw, ImageFont

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

def readOcr(fn):
    fnx, ext = os.path.splitext(fn)
    with open(fnx + '.json', 'r') as infile:
        data = infile.read()
    return json.loads(data)

def convertBoundingBox(str):
    return [int(x) for x in str.split(',')]

def drawBox(draw, elem, color):
    bb = convertBoundingBox(elem['boundingBox'])
    draw.rectangle(((bb[0], bb[1]), (bb[0] + bb[2], bb[1] + bb[3])), outline = color)

def annotateImage(fn, data):
    image = Image.open(fn)
    image = image.rotate(float(data['textAngle']))
    draw = ImageDraw.Draw(image)
    for region in data['regions']:
        drawBox(draw, region, 'white')
        for line in region['lines']:
            drawBox(draw, line, 'red')
            for word in line['words']:
                drawBox(draw, word, 'green')

    #image.show()
    fnx, ext = os.path.splitext(os.path.basename(fn))
    image.save('out/' + fnx + '.annotated.jpg', 'JPEG')
    del draw
    image.close()

def reconstructImage(fn, data):
    base = Image.open(fn)
    image = Image.new('RGB', base.size, 'white')

    fnt = ImageFont.truetype('./DejaVuSansMono.ttf', 16)
    draw = ImageDraw.Draw(image)
    for region in data['regions']:
        for line in region['lines']:
            for word in line['words']:
                bb = convertBoundingBox(word['boundingBox'])
                draw.text((bb[0], bb[1]), word['text'], font = fnt, fill = 'black')

    #image.show()
    fnx, ext = os.path.splitext(os.path.basename(fn))
    image.save('out/' + fnx + '.reconstructed.jpg', 'JPEG')
    del draw
    image.close()
    base.close()

def main():
    fn = sys.argv[2]
    #data = performOcr(fn)
    data = readOcr(fn)
    if not 'textAngle' in data:
        print('No OCR data for ' + fn)
        return
    
    annotateImage(fn, data)
    reconstructImage(fn, data)

if __name__ == '__main__':
    main()
