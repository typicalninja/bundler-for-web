import etag from 'etag';

export function getScriptHeaders(script: string) {
	const headers = {
		"etag": etag(script),
		"content-type": "text/javascript",
		"content-length": script.length,
	};
	return headers;
}
