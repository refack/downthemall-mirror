/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is DownThemAll Metalinker module.
 *
 * The Initial Developer of the Original Code is Nils Maier
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Nils Maier <MaierMan@web.de>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

const EXPORTED_SYMBOLS = [
	"parse",
	"Metalink",
	"NS_DTA",
	"NS_HTML",
	"NS_METALINKER3",
	"NS_METALINKER4",
];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;
const Ctor = Components.Constructor;
const module = Cu.import;
const Exception = Components.Exception;

/**
 * DownThemAll! Properties namespace
 */
const NS_DTA = 'http://www.downthemall.net/properties#';
/**
 * XHTML namespace
 */
const NS_HTML = 'http://www.w3.org/1999/xhtml';
/**
 * Metalinker3 namespace
 */
const NS_METALINKER3 = 'http://www.metalinker.org/';
/**
 * Metalinker 4 namespace
 */
const NS_METALINKER4 = 'urn:ietf:params:xml:ns:metalink';

const Preferences = {}, DTA = {}, Version = {};
module("resource://dta/preferences.jsm", Preferences);
module("resource://dta/api.jsm", DTA);
module("resource://dta/version.jsm", Version);
module("resource://dta/utils.jsm");
module("resource://dta/urlmanager.jsm");

const IOService = DTA.IOService;
const XPathResult = Ci.nsIDOMXPathResult;

const File = new Ctor('@mozilla.org/file/local;1', 'nsILocalFile', 'initWithPath');
const FileInputStream = new Ctor('@mozilla.org/network/file-input-stream;1', 'nsIFileInputStream', 'init');
const DOMParser = new Ctor("@mozilla.org/xmlextras/domparser;1", 'nsIDOMParser');

ServiceGetter(this, "Debug", "@downthemall.net/debug-service;1", "dtaIDebugService");

/**
 * Parsed Metalink representation
 * (Do not construct yourself unless you know what you're doing)
 */
function Metalink(downloads, info, parser) {
	this.downloads = downloads;
	this.info = info;
	this.parser = parser;
}
Metalink.prototype = {
	/**
	 * Array of downloads
	 */
	downloads: [],
	/**
	 * Dict of general information
	 */
	info: {},
	/**
	 * Parser identifaction
	 */
	parser: ""
};

function Base(doc, NS) {
	this._doc = doc;
	this._NS = NS;
}
Base.prototype = {
	lookupNamespaceURI: function Base_lookupNamespaceURI(prefix) {
		switch (prefix) {
		case 'html':
			return NS_HTML;
		case 'dta':
			return NS_DTA;
	  }
	  return this._NS;		
	},
	getNodes: function (elem, query) {
		let rv = [];
		let iterator = this._doc.evaluate(
			query,
			elem,
			this,
			XPathResult.ORDERED_NODE_ITERATOR_TYPE,
			null
		);
		for (let n = iterator.iterateNext(); n; n = iterator.iterateNext()) {
			rv.push(n);
		}
		return rv;
	},
	getNode: function Base_getNode(elem, query) {
		let r = this.getNodes(elem, query);
		if (r.length) {
			return r.shift();
		}
		return null;
	},
 	getSingle: function BasegetSingle(elem, query) {
 		let rv = this.getNode(elem, 'ml:' + query);
 		return rv ? rv.textContent.trim() : '';
 	},
 	getLinkRes: function BasegetLinkRes(elem, query) {
 		let rv = this.getNode(elem, 'ml:' + query);
 		if (rv) {
 			let n = this.getSingle(rv, 'name'), l = this.checkURL(this.getSingle(rv, 'url'));
 			if (n && l) {
 				return [n, l];
 			}
 		}
 		return null;
 	},
 	checkURL: function Base_checkURL(url, allowed) {
 		if (!url) {
 			return null;
 		}
 		try {
			url = IOService.newURI(url, this._doc.characterSet, null);
			if (url.scheme == 'file') {
				throw new Exception("file protocol invalid!");
			}
			// check for some popular bad links :p
			if (['http', 'https', 'ftp'].indexOf(url.scheme) == -1 || url.host.indexOf('.') == -1) {
				if (!(allowed instanceof Array)) {
					throw new Exception("bad link!");
				}
				if (allowed.indexOf(url.scheme) == -1) {
						throw new Exception("not allowed!");
					}
			}
			return url.spec;
 		}
 		catch (ex) {
 			Debug.log("checkURL: failed to parse " + url, ex);
 			// no-op
 		}
		return null; 		
 	}
};

/**
 * Metalink3 Parser
 * @param doc document to parse
 * @return Metalink
 */
function Metalinker3(doc) {
	let root = doc.documentElement;
	if (root.nodeName != 'metalink' || root.getAttribute('version') != '3.0') {
		throw new Exception('mlinvalid');
	}
	Base.call(this, doc, NS_METALINKER3);
}
Metalinker3.prototype = {
	__proto__: Base.prototype,
	parse: function ML3_parse(aReferrer) {
		if (aReferrer && 'spec' in aReferrer) {
			aReferrer = aReferrer.spec;
		}
		
		let doc = this._doc;
		let root = doc.documentElement;
		let downloads = [];
		
		let files = this.getNodes(doc, '//ml:files/ml:file');
		for each (let file in files) {
			let fileName = file.getAttribute('name');
			if (!fileName) {
				throw new Exception("File name not provided!");
			}
			let referrer = null;
			if (file.hasAttributeNS(NS_DTA, 'referrer')) {
				referrer = file.getAttributeNS(NS_DTA, 'referrer');
			}
			else {
				referrer = aReferrer;
			}
			let num = null;
			if (file.hasAttributeNS(NS_DTA, 'num')) {
				try {
					num = parseInt(file.getAttributeNS(NS_DTA, 'num'));
				}
				catch (ex) {
					/* no-op */
				}
			}
			if (!num) {
				num = DTA.currentSeries();
			}
			let startDate = new Date();
			if (file.hasAttributeNS(NS_DTA, 'date')) {
				try {
					startDate = new Date(parseInt(file.getAttributeNS(NS_DTA, 'num')));
				}
				catch (ex) {
					/* no-op */
				}
			}				
				
			let urls = [];
			let urlNodes = this.getNodes(file, 'ml:resources/ml:url');
			for each (var url in urlNodes) {
				let preference = 1;
				let charset = doc.characterSet;
				if (url.hasAttributeNS(NS_DTA, 'charset')) {
					charset = url.getAttributeNS(NS_DTA, 'charset');
				}
	
				let uri = null;
				try {
					if (url.hasAttribute('type') && !url.getAttribute('type').match(/^(?:https?|ftp)$/i)) {
						throw new Exception("Invalid url type");
					}
					uri = this.checkURL(url.textContent.trim());
					if (!uri) {
						throw new Exception("Invalid url");
					}							
					uri = IOService.newURI(uri, charset, null);
				}
				catch (ex) {
					Debug.log("Failed to parse URL" + url.textContent, ex);
					continue;
				}
				
				if (url.hasAttribute('preference')) {
					var a = parseInt(url.getAttribute('preference'));
					if (isFinite(a) && a > 0 && a < 101) {
						preference = a;
					}
				}
				if (url.hasAttribute('location')) {
					var a = url.getAttribute('location').slice(0,2).toLowerCase();
					if (Version.LOCALE.indexOf(a) != -1) {
						preference = 100 + preference;
					}
				}
				urls.push(new DTA.URL(uri, preference));
			}
			if (!urls.length) {
				continue;
			}
			let hash = null; 
			for each (let h in this.getNodes(file, 'ml:verification/ml:hash')) {
				try {
					h = new DTA.Hash(h.textContent.trim(), h.getAttribute('type'));
					hash = h;		
				}
				catch (ex) {
					Debug.log("Failed to parse hash: " + h.textContent.trim() + "/" + h.getAttribute('type'), ex);
				}
			}
			let desc = this.getSingle(file, 'description');
			if (!desc) {
				desc = this.getSingle(root, 'description');
			}
			let size = this.getSingle(file, 'size');
			size = parseInt(size);
			if (!isFinite(size)) {
				size = 0;
			}
			downloads.push({
				'url': new UrlManager(urls),
				'fileName': fileName,
				'referrer': referrer ? referrer : null,
				'numIstance': num,
				'title': '',
				'description': desc,
				'startDate': startDate,
				'hash': hash,
				'license': this.getLinkRes(file, "license"),
				'publisher': this.getLinkRes(file, "publisher"),
				'identity': this.getSingle(file, 'identity'),
				'copyright': this.getSingle(file, 'copyright'),
				'size': size,
				'version': this.getSingle(file, 'version'),
				'logo': this.checkURL(this.getSingle(file, 'logo', ['data'])),
				'lang': this.getSingle(file, 'language'),
				'sys': this.getSingle(file, 'os'),
				'mirrors': urls.length, 
				'selected': true,
				'fromMetalink': true
			});
		}
		let info = {
			'identity': this.getSingle(root, 'identity'),
			'description': this.getSingle(root, 'description'),
			'logo': this.checkURL(this.getSingle(root, 'logo', ['data'])),
			'license': this.getLinkRes(root, "license"),
			'publisher': this.getLinkRes(root, "publisher"),
			'start': false
		};
		return new Metalink(downloads, info, "Metalinker Version 3.0");
	}
};

/**
 * Metalink4 (IETF) Parser
 * @param doc document to parse
 * @return Metalink
 */
function Metalinker4(doc) {
	let root = doc.documentElement;
	if (root.nodeName != 'metalink' || root.namespaceURI != NS_METALINKER4 ) {
		Debug.logString(root.nodeName + "\nns:" + root.namespaceURI);
		throw new Exception('mlinvalid');
	}
	Base.call(this, doc, NS_METALINKER4);
}
Metalinker4.prototype = {
	__proto__: Base.prototype,
	parse: function ML4_parse(aReferrer) {
		if (aReferrer && 'spec' in aReferrer) {
			aReferrer = aReferrer.spec;
		}
		
		let doc = this._doc;
		let root = doc.documentElement;
		let downloads = [];
		
		let files = this.getNodes(doc, '/ml:metalink/ml:file');
		for each (let file in files) {
			let fileName = file.getAttribute('name');
			if (!fileName) {
				throw new Exception("File name not provided!");
			}
			let referrer = null;
			if (file.hasAttributeNS(NS_DTA, 'referrer')) {
				referrer = file.getAttributeNS(NS_DTA, 'referrer');
			}
			else {
				referrer = aReferrer;
			}
			let num = null;
			if (file.hasAttributeNS(NS_DTA, 'num')) {
				try {
					num = parseInt(file.getAttributeNS(NS_DTA, 'num'));
				}
				catch (ex) {
					/* no-op */
				}
			}
			if (!num) {
				num = DTA.currentSeries();
			}
			let startDate = new Date();
			if (file.hasAttributeNS(NS_DTA, 'date')) {
				try {
					startDate = new Date(parseInt(file.getAttributeNS(NS_DTA, 'num')));
				}
				catch (ex) {
					/* no-op */
				}
			}				
			
			let urls = [];
			let urlNodes = this.getNodes(file, 'ml:url');
			for each (var url in urlNodes) {
				let preference = 1;
				let charset = doc.characterSet;
				if (url.hasAttributeNS(NS_DTA, 'charset')) {
					charset = url.getAttributeNS(NS_DTA, 'charset');
				}
				
				let uri = null;
				try {
					uri = this.checkURL(url.textContent.trim());
					if (!uri) {
						throw new Exception("Invalid url");
					}							
					uri = IOService.newURI(uri, charset, null);
				}
				catch (ex) {
					Debug.log("Failed to parse URL" + url.textContent, ex);
					continue;
				}
				
				if (url.hasAttribute('priority')) {
					let a = parseInt(url.getAttribute('priority'));
					if (a > 0) {
						preference = a;
					}
				}
				if (url.hasAttribute('location')) {
					let a = url.getAttribute('location').slice(0,2).toLowerCase();
					if (Version.LOCALE.indexOf(a) != -1) {
						preference = Math.max(preference / 4, 1);
					}
				}
				urls.push(new DTA.URL(uri, preference));
			}
			if (!urls.length) {
				continue;
			}
			// normalize preferences
			let pmax = urls.reduce(function(p,c) isFinite(c.preference) ? Math.max(c.preference, p) : p, 1)
			let pmin = urls.reduce(function(p,c) isFinite(c.preference) ? Math.min(c.preference, p) : p, pmax - 1);
			urls.forEach(function(url) {
				url.preference = Math.max(100 - ((url.preference - pmin) *  100 / (pmax - pmin)).toFixed(0), 10);
			});
			
			let hash = null; 
			for each (let h in this.getNodes(file, 'ml:hash')) {
				try {
					h = new DTA.Hash(h.textContent.trim(), h.getAttribute('type'));
					hash = h;		
				}
				catch (ex) {
					Debug.log("Failed to parse hash: " + h.textContent.trim() + "/" + h.getAttribute('type'), ex);
				}
			}
			let desc = this.getSingle(file, 'description');
			if (!desc) {
				desc = this.getSingle(root, 'description');
			}
			let size = this.getSingle(file, 'size');
			size = parseInt(size);
			if (!isFinite(size)) {
				size = 0;
			}
			downloads.push({
				'url': new UrlManager(urls),
				'fileName': fileName,
				'referrer': referrer ? referrer : null,
				'numIstance': num,
				'title': '',
				'description': desc,
				'startDate': startDate,
				'hash': hash,
				'license': this.getLinkRes(file, "license"),
				'publisher': this.getLinkRes(file, "publisher"),
				'identity': this.getSingle(file, "identity"),
				'copyright': this.getSingle(file, "copyright"),
				'size': size,
				'version': this.getSingle(file, "version"),
				'logo': this.checkURL(this.getSingle(file, "logo", ['data'])),
				'lang': this.getSingle(file, "language"),
				'sys': this.getSingle(file, "os"),
				'mirrors': urls.length, 
				'selected': true,
				'fromMetalink': true
			});
		}
		let info = {
				'identity': this.getSingle(root, "identity"),
				'description': this.getSingle(root, "description"),
				'logo': this.checkURL(this.getSingle(root, "logo", ['data'])),
				'license': this.getLinkRes(root, "license"),
				'publisher': this.getLinkRes(root, "publisher"),
				'start': false
		};
		return new Metalink(downloads, info, "Metalinker Version 4.0 (IETF)");
	}
};

const __parsers__ = [
	Metalinker3,
	Metalinker4
];

/**
 * Parse a metalink
 * @param aFile (nsIFile) Metalink file
 * @param aReferrer (String) Optional. Referrer
 * @return (Metalink) Parsed metalink data 
 */
function parse(aFile, aReferrer) {
	let fiStream = new FileInputStream(aFile, 1, 0, false);
	let doc;
	try {
		doc = new DOMParser().parseFromStream(
				fiStream,
				null,
				aFile.fileSize,
				"application/xml"
		);
		if (doc.documentElement.nodeName == 'parsererror') {
			throw new Exception("Failed to parse XML");
		}
	}
	finally {
		fiStream.close();
	}
	
	for each (let parser in __parsers__) {
		try {
			parser = new parser(doc);
		}
		catch (ex) {
			Debug.log(parser.name + " failed", ex);
			continue;
		}
		return parser.parse(aReferrer);
	}
	throw new Exception("");
}