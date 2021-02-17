// // use pdf-poppler to convert pdf to png

// const path = require('path')
// const pdf = require('pdf-poppler');

// let file = 'src/web/W.pdf';

// let opts = {
//     format: 'png',
//     scale: 4096, 
//     out_dir: path.dirname(file),
//     out_prefix: path.basename(file, path.extname(file)),
//     page: null
// }

// pdf.convert(file, opts)
//     .then(res => {
//         console.log('Successfully converted');
//     })
//     .catch(error => {
//         console.error(error);
//     })

// // use potrace to convert png to svg (will need to loop through all pages)

// var potrace = require('potrace')
// var fs = require('fs');
//         var params = {
//             alphaMax: 0, // don't make any curves, just straight line segments
//             threshold: 120
//         };
// potrace.trace('src/web/W-1.png', params, function (err, svg) {
//     if (err) throw err;
//     fs.writeFileSync('src/web/W-1.svg', svg);
// });

var fs = require('fs');
var c = fs.readFileSync('src/web/W-1.svg', 'utf8');
var p = c.substr(c.indexOf('<path d="') + 9, c.lastIndexOf('"')).split(" M ");
var minX;
var maxX;
var minY;
var maxY;
var midX;
var midY;
var n;
var isX;
for (var i = 0; i < 5; i++) {
    var m = p[i].split(/[\s,]+/);
    minX = Infinity;
    minY = Infinity;
    maxX = 0;
    maxY = 0;
    isX = true;
    for (var j = 0; j < m.length; j++) {
        if (!isNaN(m[j])) {
            n = parseFloat(m[j]);
            console.log(n);
            if (isX) {
                minX = Math.min(minX, n);
                maxX = Math.max(maxX, n);
            }
            else {
                minY = Math.min(minY, n);
                maxY = Math.max(maxY, n);
            }
            isX = !isX;
        }
        else console.log(m[j]);
    }
    midX = Math.round(((minX + maxX) / 2) * 1000) / 1000;
    midY = Math.round(((minY + maxY) / 2) * 1000) / 1000;
    console.log("   so to translate . . .");
    for (var k = 0; k < m.length; k++) {
        if (!isNaN(m[k])) {
            if (isX) {
                n = Math.round((parseFloat(m[k]) - midX) * 1000) / 1000;
            }
            else {
                n = Math.round((parseFloat(m[k]) - midY) * 1000) / 1000;
            }
            isX = !isX;
            console.log(n);
        }
        else console.log(m[k]);
    }
    console.log("  minX is " + minX + ", minY is " + minY);
    console.log("  maxX is " + maxX + ", maxY is " + maxY);
    console.log("  midpoint is " + midX + ", " + midY + ": next M");
    break
}

//  // view and edit .svg file, then save as pdf
//  // type this into you browser to view: http://localhost:3000/

// const PDFDocument = require('pdfkit')
// const SVGtoPDF = require('svg-to-pdfkit')

// const express = require('express')
// const app = express()

// const background = fs
//     .readFileSync('src/web/test.svg')
//     .toString()

// app.get("/", (req, res) => {
//     const doc = new PDFDocument({
//         size: [3072, 1988]
//     })

//     SVGtoPDF(doc, background)
//     //  doc.addPage()

//     doc.pipe(res) // or doc.pipe(fs.createWriteStream('/path/to/file.pdf'));
//     doc.end()
// })

// app.listen(3000)