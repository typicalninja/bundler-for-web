import semver from "semver"

/**
 * Parse A Package Version from the given version to all the available versions
 * @param reqData - The PackageData Fetched From registry
 * @param parsedVersion - User Supplied/ (or default: "latest") version
 * @returns 
 */
export const getVersion = (reqData: any, parsedVersion: string) => {
	if(semver.valid(parsedVersion) && semver.maxSatisfying(Object.keys(reqData.versions), parsedVersion)) return semver.clean(parsedVersion);
	if(reqData['dist-tags'][parsedVersion]) {
		const v = semver.clean(reqData['dist-tags'][parsedVersion])
		if(v && semver.maxSatisfying(Object.keys(reqData.versions), v)) return v
	}
	return null;
}