/*
 * Generates the dist/cdn release copies exactly as build/release.js
 * makeReleaseCopies() does, without needing the jquery-release tooling.
 * Usage (from the repo root, after the grunt build): node .github/ci/cdn-copies.js
 */
var fs = require( "fs" ),
	version = require( "../../package.json" ).version,

	devFile = "dist/jquery.js",
	minFile = "dist/jquery.min.js",
	mapFile = "dist/jquery.min.map",

	cdnFolder = "dist/cdn",

	releaseFiles = {
		"jquery-VER.js": devFile,
		"jquery-VER.min.js": minFile,
		"jquery-VER.min.map": mapFile,
		"jquery.js": devFile,
		"jquery.min.js": minFile,
		"jquery.min.map": mapFile,
		"jquery-latest.js": devFile,
		"jquery-latest.min.js": minFile,
		"jquery-latest.min.map": mapFile
	};

if ( !fs.existsSync( cdnFolder ) ) {
	fs.mkdirSync( cdnFolder );
}

Object.keys( releaseFiles ).forEach(function( key ) {
	var text,
		builtFile = releaseFiles[ key ],
		unpathedFile = key.replace( /VER/g, version ),
		releaseFile = cdnFolder + "/" + unpathedFile;

	if ( /\.map$/.test( releaseFile ) ) {
		// "file":"jquery.min.js","sources":["jquery.js"]
		text = fs.readFileSync( builtFile, "utf8" )
			.replace( /"file":"([^"]+)","sources":\["([^"]+)"\]/,
				"\"file\":\"" + unpathedFile.replace( /\.min\.map/, ".min.js" ) +
				"\",\"sources\":[\"" + unpathedFile.replace( /\.min\.map/, ".js" ) + "\"]" );
		fs.writeFileSync( releaseFile, text );
	} else if ( /\.min\.js$/.test( releaseFile ) ) {
		// Remove the source map comment
		text = fs.readFileSync( builtFile, "utf8" )
			.replace( /\/\/# sourceMappingURL=\S+/, "" );
		fs.writeFileSync( releaseFile, text );
	} else {
		fs.writeFileSync( releaseFile, fs.readFileSync( builtFile ) );
	}
});
