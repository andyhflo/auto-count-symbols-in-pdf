# Auto-Count Symbols in PDF

	The intent is to automatically count symbols in a PDF set of electrical
	construction drawings -- could be generalized to other symbol recognition
	needs


2021.02.10 update:
	Given the variety of PDF files which could be input, an initial idea is to
	first create a high resolution image of the PDF, then trace the outlines,
	and do most (if not all) of the analysis and rearranging in a simpler
	intermdiate format such as .svg.  

		pdf-poppler can be used to create a .png for each page of the pdf.
		potrace can then be used to create a .svg for each .png
		pdfkit & svg-to-pdfkit can then create a .pdf (for viewing & saving)

	For now, I have commented out the code at the beginning of 20210208.js for
	creating .png and .svg files and also commented out the code at the end for
	viewing and saving so that I can dive into the .svg

	Above is my idea for an overall framework for the project.


	Now into the more fun details:
	Right now I am just using the console.log to see how to split apart the
	.svg file.

	I have been able to find the minimum & maximum x & y coordinates for the
	first five shapes in the file and find the average or center point then
	translate each coordinate to being centered around (0,0).

	I will rearrange W-1 part.svg (the potrace output shortened to the first
	five shapes only) to test.svg (all shapes defined around (0,0) but not
	drawn and giving a unique id,  later in the file they are drawn using an
	href to their id with the coordinates where they are to be centered)

	Next I will sort the shapes by size and use the square of the differences
	to find matches within a certain tolerance.  Any time a "duplicate" is
	found it's path can be deleted and it can still be drawn using an href to
	the id of the "identical" remaining path with the coordinates where this
	particular instance is to be centered