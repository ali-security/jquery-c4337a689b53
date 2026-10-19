/*
 * Headless-Chrome runner for the QUnit browser suite (test/index.html).
 *
 * Usage: node .github/ci/qunit-runner.js [url]
 *   url             defaults to http://127.0.0.1:8000/test/index.html
 * Environment:
 *   CHROME_BIN      Chrome executable (default: google-chrome-stable)
 *   QUNIT_TIMEOUT   global timeout in ms (default: 15 minutes)
 *   NODE_PATH       must resolve puppeteer-core (installed outside the repo)
 *
 * Prints one line per test, the failed assertions, and a summary line.
 * Exits 1 when any test fails, 2 when QUnit never reports done.
 */
"use strict";

const puppeteer = require( "puppeteer-core" );

const url = process.argv[ 2 ] || "http://127.0.0.1:8000/test/index.html";
const chromeBin = process.env.CHROME_BIN || "google-chrome-stable";
const globalTimeout = Number( process.env.QUNIT_TIMEOUT ) || 15 * 60 * 1000;

// Runs in the page (top frame only) before any page script. QUnit 1.14 assigns
// `window.QUnit = QUnit` once loaded; a setter trap registers the callbacks then,
// i.e. before the suite (autostart = false, started by testinit.js) begins.
function installHooks() {
	if ( window.top !== window ) {
		return;
	}

	function dump( value ) {
		let text;
		try {
			text = window.QUnit.jsDump ? window.QUnit.jsDump.parse( value ) : String( value );
		} catch ( e ) {
			text = String( value );
		}
		return text && text.length > 500 ? text.slice( 0, 500 ) + "..." : text;
	}

	function hook( QUnit ) {
		let failures = [];
		QUnit.testStart( function() {
			failures = [];
			window.__qunitReport( "testStart", {} );
		} );
		QUnit.log( function( details ) {
			if ( !details.result ) {
				failures.push( {
					message: details.message == null ? "" : String( details.message ),
					actual: dump( details.actual ),
					expected: dump( details.expected ),
					source: details.source ? String( details.source ) : ""
				} );
			}
		} );
		QUnit.testDone( function( details ) {
			window.__qunitReport( "testDone", {
				module: details.module,
				name: details.name,
				failed: details.failed,
				passed: details.passed,
				total: details.total,
				failures: failures
			} );
		} );
		QUnit.done( function( details ) {
			window.__qunitReport( "done", {
				failed: details.failed,
				passed: details.passed,
				total: details.total,
				runtime: details.runtime
			} );
		} );
	}

	let current;
	Object.defineProperty( window, "QUnit", {
		configurable: true,
		get: function() {
			return current;
		},
		set: function( value ) {
			current = value;
			if ( value && typeof value.testDone === "function" && !value.__runnerHooked ) {
				value.__runnerHooked = true;
				hook( value );
			}
		}
	} );
}

async function main() {
	const browser = await puppeteer.launch( {
		executablePath: chromeBin,
		headless: true,
		args: [ "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage" ]
	} );

	const stats = { tests: 0, passedTests: 0, failedTests: 0 };
	let doneDetails = null;
	let finish;
	const finished = new Promise( function( resolve ) {
		finish = resolve;
	} );
	let doneTimer = null;

	const page = await browser.newPage();

	page.on( "dialog", function( dialog ) {
		dialog.dismiss().catch( function() {} );
	} );
	page.on( "pageerror", function( err ) {
		console.log( "PAGE ERROR: " + ( err && err.message ? err.message : err ) );
	} );
	page.on( "error", function( err ) {
		console.log( "PAGE CRASHED: " + err );
		finish( "crash" );
	} );

	await page.exposeFunction( "__qunitReport", function( type, data ) {
		if ( type === "testStart" ) {
			// A test after a done event means the queue drained early; keep waiting
			if ( doneTimer ) {
				clearTimeout( doneTimer );
				doneTimer = null;
			}
		} else if ( type === "testDone" ) {
			stats.tests++;
			if ( data.failed > 0 ) {
				stats.failedTests++;
			} else {
				stats.passedTests++;
			}
			console.log( ( data.failed > 0 ? "FAIL " : "PASS " ) + data.module + " :: " +
				data.name + " (" + data.passed + "/" + data.total + ")" );
			data.failures.forEach( function( f ) {
				console.log( "    assertion failed: " + f.message );
				console.log( "      expected: " + f.expected );
				console.log( "      actual:   " + f.actual );
				if ( f.source ) {
					console.log( "      source:   " + f.source.split( "\n" ).join( "\n                " ) );
				}
			} );
		} else if ( type === "done" ) {
			doneDetails = data;
			if ( doneTimer ) {
				clearTimeout( doneTimer );
			}
			doneTimer = setTimeout( function() {
				finish( "done" );
			}, 3000 );
		}
	} );

	await page.evaluateOnNewDocument( installHooks );

	const timer = setTimeout( function() {
		finish( "timeout" );
	}, globalTimeout );

	console.log( "Opening " + url );
	await page.goto( url, { waitUntil: "load", timeout: 120000 } );

	const outcome = await finished;
	clearTimeout( timer );
	await browser.close().catch( function() {} );

	if ( outcome !== "done" || !doneDetails ) {
		console.log( "QUnit summary: " + stats.tests + " tests, " + stats.passedTests +
			" passed, " + stats.failedTests + " failed; QUnit did not report done (" +
			outcome + ")" );
		return 2;
	}

	console.log( "QUnit summary: " + stats.tests + " tests, " + stats.passedTests +
		" passed, " + stats.failedTests + " failed; assertions " + doneDetails.passed +
		" passed / " + doneDetails.total + " total (" + doneDetails.failed + " failed) in " +
		doneDetails.runtime + "ms" );
	return stats.failedTests > 0 || doneDetails.failed > 0 ? 1 : 0;
}

main().then( function( code ) {
	process.exit( code );
}, function( err ) {
	console.error( err && err.stack ? err.stack : err );
	process.exit( 2 );
} );
