import path from "path";
import config from "../config";
import { PROCESS_EVENTS } from "../utils/constants";
import { createWriteStream, emptyDir, ensureDir, readFile, rmdir, stat, writeFile } from 'fs-extra'
import axios from "axios";
import tar from 'tar';
import { exec } from "child_process";
import { normalizePackageName } from "../utils/normalize";

// our bundling packages
import webpack from 'webpack';

// polyfill for webpack
import nodePolyFills from 'node-polyfill-webpack-plugin'
import { directoryExists, rmDir } from "../utils/fileSys";


let pkg = '<unknown>';
let bundlingStarted = false;

/**
 * Wrap Around process.send
*/
const send = (data: any) => process.send && process.send(data);


// Child Process
async function createBundle({ hash, reqData, version }: { hash: string; reqData: any; version: string }) {
		const dir = path.join(config.tmpDir, `./${hash}`)
		const cwd = path.join(dir, './package')
		try {
			const dirInstalled = await directoryExists(dir);
			await ensureDir(dir);
			if(!dirInstalled) await fetchAndInstall({ reqData, version, dir })
			const { pkgJsonContent } = await removeScripts({ cwd })
			pkg = pkgJsonContent.name
			const nodeModuleExists = await directoryExists(path.join(cwd, './node_modules'))
			if(!nodeModuleExists || Object.keys(pkgJsonContent.dependencies).length > 0) await installDeps({ cwd })
			const code = await bundleUsingWebpack({ cwd, pkgJsonContent })
			await rmDir(dir).then(() => log(`Successfully Deleted Folder ${dir}`)).catch((e) => log(`Error Occurred Deleting ${dir}: ${e}`))
			send({ 
				event: PROCESS_EVENTS.bundle,
				result: code,
			})
		}
		catch(err: unknown) {
			await rmDir(dir).then(() => log(`Successfully Deleted Folder while error ${dir}`)).catch((e) => log(`Error Occurred Deleting [while Error] ${dir}: ${e}`))
			//await rmdir(dir).then(() => log(`Successfully Deleted ${dir}`)).catch(() => log(`Error Occurred Deleting ${dir}`))
			log(`Failed to bundle: ${err}`)
			send({
				event: PROCESS_EVENTS.fail,
				error: err instanceof Error ? err.toString() : err,
			})
		}
}


/**
 * Fetches the Package From npm and installs it to disk [part 1]
 * @param param0 - 
 * @returns 
 */
function fetchAndInstall({ reqData, version, dir }: { reqData: any; version: string; dir: string }) {
	const versionTar = reqData.versions[version].dist.tarball;
	const tarDest = path.join(dir, './package.tgz')
	log(`Downloading: ${versionTar} to ${tarDest}`);
	return new Promise((resolve, reject) => {
			const distWriter = createWriteStream(tarDest);
			let didTimeOut = false;
			const timeout = setTimeout(() => {
				didTimeOut = true;
				reject(`Package Download Timed Out`)
			}, 10000)
			axios({
				url: versionTar,
				method: 'get',
				responseType: 'stream'
			}).then((res) => {	
				res.data.pipe(distWriter)
				let error = false;
				distWriter.on('error', () => {
					error = true;
					// close the stream
					distWriter.close();
					return reject(`Error Occurred While Downloading tarFile at`);
				});
				distWriter.on('close', () => {
					if (!error && !didTimeOut) {
						clearTimeout(timeout)
						tar.x({
							file: tarDest,
							cwd: dir
						}).then(resolve, () => {
							return reject(`Error Occurred While Extracting TarFile`)
						})
					}
				});
			}).catch(() => {
				reject(`Error Occurred While Downloading tarFile at ${versionTar}`)
			})
	})
}

/**
 * Removes Scripts from package.json [part 2]
 * got the idea from: https://github.com/Rich-Harris/packd/blob/master/server/child-processes/create-bundle.js
 */
async function removeScripts({ cwd = '' }) {
	log(`Sanitizing Downloaded Script`)
	const pkgJsonPath = path.join(cwd, './package.json')
	try {
		const fileContent = await readFile(pkgJsonPath, 'utf8')
		const pkgJson = JSON.parse(fileContent);
		pkgJson.scripts = {};
		await writeFile(pkgJsonPath, JSON.stringify(pkgJson, null, 2))
		 return {
			pkgJsonContent: pkgJson
		 }
	}
	catch {
		throw new Error(`Error Occurred While Sanitizing Package.json`)
	}
}

/**
 * Installs dependencies of a package [p 3]
 * @param param0 
 */
async function installDeps({ cwd }: { cwd: string  }) {
	log(`Installing dependencies At ${cwd}`)
	try {
		await execCmd({
			cmd: `npm i`,
			cwd
		});
	}
	catch(e) {
		throw new Error(`Error Occurred While installing Dependencies: ${e}`)
	}
}

/**
 * Bundle A Package Using Webpack
 * @param param0 
 * @returns 
 */
function bundleUsingWebpack({ pkgJsonContent, cwd }: { pkgJsonContent: { [key: string]: any }; cwd: string  }) {
	log(`Bundling Package With Webpack`)
	const entry = pkgJsonContent.module || pkgJsonContent.main;
	const pkgName = normalizePackageName(pkgJsonContent.name);
	if(!entry) throw new Error(`Package [${pkgName}] Does not contain a Entry File`)
	const entryFile = path.resolve(cwd, entry)
	return new Promise((resolve, reject) => {
		const outPutFile = path.resolve(cwd, './bundle-webpack-code.js')
		try {
			//const baseCode = await readFile(entryFile, 'utf8')
			log(`Compiling from ${entryFile}`)
			webpack({
				mode: 'production',
				entry: entryFile,
				output: {
					path: cwd,
					filename: './bundle-webpack-code.js',
					library: pkgName || `_u`
				},
				target: ['web'],
				plugins: [
					/** We Include PolyFills if needed */
					new nodePolyFills(),
				],
			}, (e, s) => {
					log(`Compiled`)
					if(e || s?.hasErrors()){
						if(s?.hasErrors()) {
							const info = s.toJson();
							reject(`WebPack Error: ${JSON.stringify(info.errors)}`);
						}
						else {
							reject(`WebPack Fatal Error: ${e}`)
						}
					}
					readFile(outPutFile, 'utf8').then((c) => {
						resolve(c)
					});
			});
		}
		catch(e) {
			reject(`Error occurred while bundling with webpack: ${e}`)
		}
	})
}

function log (message: string) { if(config.workerLogs) send({ event: PROCESS_EVENTS.log, message: `[${pkg}]: ${message}` }) }
function execCmd({
	cmd = '',
	cwd = '',
}) {
	return new Promise((resolve, reject) => {
		exec(cmd, { cwd },  (err, stdout, stderr) => {
			if (err) {
				return reject(err);
			}

			if(config.workerLogs) {
				stdout.split('\n').forEach(line => {
					log(`${line}`);
				});
	
				stderr.split('\n').forEach(line => {
					log(`${line}`);
				});
			}

			resolve(void 0);
		});
	});
}

// handle messages
process.on('message', (msg: { event: string; data: any }) => {
	if(msg.event == PROCESS_EVENTS.bundle && !bundlingStarted) {
		bundlingStarted = true;
		createBundle(msg.data);
	}
});

// send ready so we can start
send({ event: PROCESS_EVENTS.ready })