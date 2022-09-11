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
		return cache.has(pkgData.hash).then((have) => {
			if(have) {
				logger.debug(`Offering Cache Bundle for [${pkgData.hash} - ${pkgData.tag}]`)
				return resolve(getCacheBundle(pkgData.hash, options.minify))
			}
			else {
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
					const complete = () => {
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
					}
					// set to cache
					cache.set(pkgData.hash, msg.result).then(complete).catch(complete)
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
							return rejectHttpResponse('Bundler Timed Out [35000ms elapsed]')
					}, 35000)
				break;
			}
		})
			}
		})
	});
}

export async function getCacheBundle(hash: string, minify: boolean): Promise<httpResponse> {
	// will only get called if script was found as cache
	const script = await cache.get(hash) as string;
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