/**
 * Some Of our code is inspired by:
 * https://github.com/Rich-Harris/packd/blob/master/server/serve-package.js
 */

import axios from 'axios';
import { fork } from 'child_process';
import { FastifyReply, FastifyRequest } from 'fastify';
import path from 'path';
import sha1 from 'sha1';
import cache from '../cache';
import config from '../config';
import { httpResponse, Insert_ScriptServerComments, Insert_SubStituteFailScript, PROCESS_EVENTS } from '../utils/constants';
import { getVersion } from './formatVersion';
import { toUrl, parsedPkg } from './packageData';
import { minify } from "terser";
import { Options } from '../utils/parseOptions';
import { getScriptHeaders } from '../utils/script';
import logger from '../utils/logger';


export const fetchPackage = ({ options, pkgData }: { options: Options, pkgData: parsedPkg }):
	Promise<httpResponse> => {
	const url = `${config.registry}/${toUrl(pkgData)}`;
	const sendError = (error: string): httpResponse => {
		return {
			result: options.substituteScriptOnFail ? Insert_SubStituteFailScript({ reason: error, pkg: pkgData.tag }) : null,
			error: {
				error: true,
				message: error,
				data: [error]
			}
		}
	}
	return new Promise((resolve) => {
		return axios({ url, method: 'GET', responseType: 'json' }).then(({ data }) => {
			const version = getVersion(data, pkgData.version)
			if(!version) return resolve(sendError(`Invalid version/version-tag: ${pkgData.version}`))
			pkgData.version = version;

			// everything is all right [valid package, valid version] on to the next step
			return makeBundle({
				reqData: data,
				pkgData,
				options
			}).then(resolve).catch(resolve)
		}).catch((err) => {
			return resolve(sendError(`[MODULE_NOT_FOUND] Package ${pkgData.package} Cannot be found [${err instanceof Error ? err.toString() : err}]`))
		})
	})
}


const getModifiedScript = ({ script = '', cache = true, minified = true }): Promise<string> => {
	return new Promise((resolve) => {
		if(minified) {
			return minify(script, { sourceMap: false, compress: true }).then((result) => {
				return resolve(Insert_ScriptServerComments(result.code || script, cache, minified));
			}).catch(() => {
				// failed minify, resolve non minified
				return resolve(Insert_ScriptServerComments(script, cache, minified));
			})
		}
		else return resolve(Insert_ScriptServerComments(script, cache, minified))
	})
}

export function makeBundle({ reqData, pkgData, options }: { reqData: any; pkgData: parsedPkg; options: Options }): Promise<httpResponse> {
	return new Promise((resolve, reject) => {
		if(cache.has(pkgData.hash)) return resolve(getCacheBundle(pkgData.hash, options.minify));
		const InstallerController = new AbortController();
		const installer = fork(path.join(__dirname, '../child/npm-installer'), { signal: InstallerController.signal })
		const rejectHttpResponse = (m: string, err?: string[]) => {
			// first remove all listeners
			installer.removeAllListeners();
			// kill installer
			installer.kill()
			return reject({
				result: options.substituteScriptOnFail ? Insert_SubStituteFailScript({ reason: m, pkg: pkgData.tag }) : null,
				error: {
					error: true,
					message: m,
					data: err || []
				},

			})
		}
		let timeout: null | NodeJS.Timeout = null;
		installer.on('error', (err) => rejectHttpResponse('Installer Encountered A Error [child_process::EVENT]', [err.toString()]));
		installer.on('message', (msg: {	event: string; message: string; error: string; result: string  }) => {
			switch(msg.event) {
				case PROCESS_EVENTS.fail:
				// handle install failures
				rejectHttpResponse(`Installer Encountered A Error [child_process::EXECUTE]`)
				break;
				case PROCESS_EVENTS.log:
					logger.debug(msg.message)
				break;
				case PROCESS_EVENTS.bundle:
					if(timeout) clearTimeout(timeout)
					cache.set(pkgData.hash, msg.result)
					getModifiedScript({
						script: msg.result,
						cache: false,
						minified: options.minify
					}).then(script => {
						return resolve({
							result: script,
							headers: getScriptHeaders(script)
						})
					});
				break;
				case PROCESS_EVENTS.ready:
					installer.send({
						event: PROCESS_EVENTS.bundle,
						data: {
							hash: pkgData.hash,
							reqData,
							version: pkgData.version
						}
					});
					timeout = setTimeout(() => {
						 	InstallerController.abort();
							return rejectHttpResponse('Bundler Timed Out [35000ms elapsed]')
					}, 35000)
				break;
			}
		})
	});
}

export async function getCacheBundle(hash: string, minify: boolean): Promise<httpResponse> {
	const script = cache.get(hash) as string
	const modified = await getModifiedScript({
		script,
		cache: true,
		minified: minify
	})
	return {
		result: modified,
		headers: getScriptHeaders(script)
	}
}



export async function _makeBundle(reqData: any, pkgData: parsedPkg, http: { request: FastifyRequest; reply: FastifyReply }, options: { [key:string]: string | boolean }) {
	// make a hash from the pkg tag (it will be unique to version)
	const hash = sha1(pkgData.tag)
	if(cache.has(hash)) {
		let unMc = cache.get(hash) as string;
		if(typeof unMc !== 'string') return http.reply.send(`Error Occurred, Corrupted Cache`)
		if(options.minify) {
			unMc = (await minify(unMc, { sourceMap: false, compress: true })).code as string
		}
		const c = Insert_ScriptServerComments(unMc, true, options.minify as boolean)
		http.reply.header('Content-Type', 'text/javascript')
		http.reply.header('Content-Length',c.length)
		return http.reply.send(c)
	}
	// start making a bundle
	const installer = fork(path.join(__dirname, '../child/npm-installer'))
	let timeout: null | NodeJS.Timeout = null;
	installer.on('message', async (m: { event: string; message: string; error: string; result: string }) => {
		switch(m.event) {
			case PROCESS_EVENTS.ready:
				installer.send({
					event: PROCESS_EVENTS.bundle,
					data: {
						hash,
						reqData,
						version: pkgData.version
					}
				})
				timeout = setTimeout(() => {
					let template_timeout = null;
					if(options.substituteScriptOnFail) {
						template_timeout = Insert_SubStituteFailScript({
							reason: 'Bundler Timed Out'
						})
					}
					else {
						template_timeout = {
							error: true,
							message: 'Bundler Timed out'
						}
					}
					installer.kill();
					http.reply.send(template_timeout);
				}, 30000)
			break;
			case PROCESS_EVENTS.bundle:
				installer.kill();
				if(timeout) clearTimeout(timeout)
				cache.set(hash, m.result)
				let baseC = m.result
				if(options.minify) {
					baseC = (await minify(baseC, { sourceMap: false, compress: true })).code as string
				}
				const c = Insert_ScriptServerComments(baseC, false, options.minify as boolean)
				http.reply.header('Content-Type', 'text/javascript')
				http.reply.header('Content-Length',c.length)
				http.reply.send(c)
			break;
			case PROCESS_EVENTS.log:
				console.log(m.message)
			break;
			case PROCESS_EVENTS.fail:
				// kill our Installer Process Since We Don't need it
				installer.kill();
				let err = null;
				if(options.substituteScriptOnFail) {
					// set content type to javascript, so its a valid script
					http.reply.header('content-type', 'text/javascript')
					err = Insert_SubStituteFailScript({
						reason: `[bundler] ${m.error}`,
						pkg: pkgData.tag,
					})
				}
				else {
					err = {
						error: true,
						message: `A Error Occurred While Installer Was Running`,
						err: m.error
					}
				}
				http.reply.send(err)
			break;
		}
	});
}