import joi from 'joi'

export type Options = {
	"substituteScriptOnFail": boolean;
	"minify": boolean,
	"bundler": 'webpack' | 'browserify',
	"hash"?: "",
}

export const defaultOpt: Options = {
	substituteScriptOnFail: true,
	minify: true,
	bundler: 'webpack',
}

export const schema = joi.object({
	substituteScriptOnFail: joi.boolean().default(defaultOpt.substituteScriptOnFail),
	minify: joi.boolean().default(defaultOpt.minify),
	bundler: joi.string().valid(...['webpack', 'rollup']).default(defaultOpt.bundler),
	hash: joi.string()
})


export const parseOptions = async (query: { [key:string]: string  }): Promise<Options> => {
	const value = await schema.validateAsync(query)
	return value;
}