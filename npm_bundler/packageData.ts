import sha1 from "sha1";
import config from "../config";

export type parsedPkg = {
	author: string | null;
	package: string | null;
	version: string | 'latest',
	tag: string,
	hash: string;
}

export const getPkgName = (pkgName: string) => pkgName.split('@')[0]
export const getPkgVersion = (pkgName: string) => pkgName.split('@')[1]
export const getPkgAuthor = (authorName: string) => authorName.startsWith('@') ? (authorName.split('@')[1] || null) : authorName


/**
 * Parses Package Data from a url
 * [Ex url: /bundle/some@v]
 * @param url - Url to parse the Data out of
 * @returns 
 */
export const parsePackageUrl = (url: string): parsedPkg => {
	// filter queries out (ex: url?hello || url/?hello since those are not needed)
	url = url.split('?')[0]
	const pkg = url.replace(`${config.baseNpmBundleUrl}/`, '').split('/')
	const containAuthor = (pkg[0] && pkg[1]);
	const parsed = {
		author: containAuthor ? (getPkgAuthor(pkg[0]) || null) : null,
		package: (containAuthor ? getPkgName(pkg[1]) : getPkgName(pkg[0])) || null,
		version: (containAuthor ? getPkgVersion(pkg[1]) : getPkgVersion(pkg[0])) || 'latest',
		get tag() {
			let t = ''
			if(this.author) t += this.author;
			if(this.package) t += this.package;
			if(this.version) t += `@${this.version}`;
			return t;
		},
		get hash() {
			return sha1(this.tag)
		}
	};

	return parsed;
}


export const toUrl = (pkgData: parsedPkg) => {
	let f = '';
	if(pkgData.author) {
		f += `@${pkgData.author}`;
	}
	if(pkgData.package) {
		f += `/${pkgData.package}`;
	}
	return f;
}
