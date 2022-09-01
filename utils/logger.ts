import pino from "pino";
import config from "../config";

export default config.pinoDebug ? pino({
	transport: {
		target: 'pino-pretty'
	},
	level: 'debug'
})
:
pino()