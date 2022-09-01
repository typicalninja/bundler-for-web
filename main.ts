import Fastify from 'fastify';
import cache from './cache';
import config from './config';
import { Options, parseOptions } from './utils/parseOptions';
import fastifyView from '@fastify/view'
import path from 'path';
import { Insert_ScriptServerComments, name, version } from './utils/constants';
import { clearTmp } from './utils/fileSys';
import logger from './utils/logger';


import { fetchPackage as FetchNpmPackage } from './npm_bundler/bundle';
import { parsePackageUrl } from './npm_bundler/packageData';
import { getScriptHeaders } from './utils/script';
import { ValidationError } from 'joi';

const fastify = Fastify({
	logger: config.loggerHttp
})

// to support ejs
fastify.register(fastifyView, {
	engine: {
	  ejs: require("ejs"),
	},
});

fastify.get('/', (request, reply) => {
	reply.view('./views/index.ejs', { name: name, version, cacheSize: cache.size });
});

fastify.get('/repl', (request, reply) => {
	reply.view('./views/repl.ejs');
});

fastify.get('/cache', (request, reply) => {
	reply.view('./views/cache.ejs', { cache: cache, query: request.query });
});

/**
 * For Npm Bundling
 */
fastify.get(`${config.baseNpmBundleUrl}/*`, async (request, reply) => {
	let opt;
	try {
		opt = await parseOptions(request.query as { [key: string]: string })
	}
	catch (err: any) {
		if(err instanceof ValidationError) {
			return {
				error: true,
				message: `Error Occurred While parsing the Options`,
				data: err?.details
			}
		}
		else {
			return {
				error: true,
				message: 'Unknown Error Occurred',
				data: []
			}
		}
	}
	let bundle;
	if(opt.hash && cache.has(opt.hash)) {
		bundle = {
			result: Insert_ScriptServerComments(cache.get(opt.hash) as string, true, opt.minify)
		}
	}
	else {
		const pkgData = parsePackageUrl(request.url)
		bundle = await FetchNpmPackage({ pkgData, options: opt });
	}
	
	// set Headers
	if(bundle.headers) reply.headers(bundle.headers)
	if(typeof bundle.result == 'string') {
		if(!bundle.headers || typeof bundle.headers !== 'object') {
			const newHeaders = getScriptHeaders(bundle.result)
			reply.headers(newHeaders);
		}
		if(bundle.error && bundle.error.error === true && opt.substituteScriptOnFail == false) {
			reply.code(500)
		}
		else {
			reply.header('cache-control', 'public, max-age=31536000, s-maxage=31536000, immutable')
		}
		return bundle.result;
	}
	else if(bundle.error) {
		if(typeof bundle.error == 'object'){
			reply.header('content-type', 'text/json')
		}
		reply.code(500)
		return bundle.error;
	}
});


fastify.listen({ port: 3000, host: '0.0.0.0' }, (err, address) => {
	if (err) throw err
	// clear the tmp folder
	clearTmp().then(() => logger.debug(`Cleared The Tmp Folder At ${config.tmpDir}`)).catch(() => logger.debug(`Failed To clear Tmp folder at ${config.tmpDir}`))
	logger.info(`Server is Now Running on ${address}`)
})