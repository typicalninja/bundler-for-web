import { emptyDir, rmdir, stat } from "fs-extra"
import config from "../config";

/**
 * Wraps emptyDir, and rmdir (fix: rmdir throws "dir not empty")
 * @param dir 
 * @returns 
 */
export async function rmDir(dir: string) {
	await emptyDir(dir)
	await rmdir(dir)
	return true;
}

export async function directoryExists(dir: string) {
	try {
		const stats = await stat(dir)
		return stats.isDirectory();
	}
	catch {
		return false;
	}
}

export async function fileExists(dir: string) {
	try {
		const stats = await stat(dir)
		return stats.isFile()
	}
	catch {
		return false;
	}
}

export async function clearTmp() {
	if((await directoryExists(config.tmpDir))) {
		await emptyDir(config.tmpDir)
		return true;
	}
	return false;
}