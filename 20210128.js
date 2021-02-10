const PDFDocument = require('pdfkit');
var fs = require('fs');

const doc = new PDFDocument({
   size: [1008, 612]
}
);

doc.pipe(fs.createWriteStream('output2.pdf'));

doc.lineWidth(.75)
   .lineCap('round')
   .moveTo(643, 154)
   .lineTo(643, 164.5)
   .stroke();

   doc.lineCap('round')
   .moveTo(645.6, 154)
   .lineTo(645.6, 164.5)
   .stroke();

doc.lineCap('square')
   .circle(644.3, 161, 3.5)
   .stroke();

// doc.lineWidth(1)
//    .lineJoin('round')
//    .rect(150, 100, 50, 50)
//    .stroke();

doc.addPage()
doc.end();