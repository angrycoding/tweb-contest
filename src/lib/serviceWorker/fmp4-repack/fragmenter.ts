/* eslint-disable */
// @ts-ignore
import MP4Box from 'mp4box';
import MP4Generator from './MP4Generator';
import Track from './Track';

const concat = (arrays: Uint8Array[]): Uint8Array => {
	if (!arrays.length) return new Uint8Array(0);
	let totalLength = arrays.reduce((acc, value) => acc + value.length, 0);
	const result = new Uint8Array(totalLength);
	let length = 0;
	for (let array of arrays) {
		result.set(array, length);
		length += array.length;
	}
	return result;
}

const getFragmentInfo = (data: Uint8Array): { tracks: Track[], parsedSize: number } | undefined => {

	let traks, parsedSize, mdatSectionLen;

	try {
		const mp4boxfile = MP4Box.createFile();
		const arrayBuffer = new Uint8Array(data).buffer;
		// @ts-ignore
		arrayBuffer.fileStart = 0;
		mp4boxfile.appendBuffer(arrayBuffer);
		const mdatSection = mp4boxfile?.mdats?.[0];
		const mdatSectionData = data.subarray(mdatSection.start + 8, mdatSection.start + mdatSection.size);
		mdatSectionLen = mdatSectionData.length;
		traks = mp4boxfile?.moov?.traks;
		let boxes = mp4boxfile?.boxes;
		const { start, size } = boxes[boxes.length -  1];
		parsedSize = start + size;
	} catch (e) {
		console.info(e);
	}

	if (!(traks instanceof Array) || !traks.length) return;
	if (!Number.isInteger(parsedSize) || parsedSize <= 0) return;
	if (!Number.isInteger(mdatSectionLen) || mdatSectionLen <= 0) return;
	
	const tracks: Track[] = traks.map((trak: any) => {
		const entries = trak.mdia.minf.stbl.stsd.entries;

		const trackData = concat(trak.samples.map((s: any) => {
			return data.subarray(s.offset, s.offset + s.size);
		}));

		return {
			data: trackData,
			id: trak.tkhd.track_id,
			timescale: trak.mdia.mdhd.timescale,
			codecData: data.subarray(
				entries[0].start,
				entries[entries.length - 1].start + entries[entries.length - 1].size
			),
			samples: trak.samples.map((sample: any) => ({
				size: sample.size,
				duration: sample.duration,
				dts: sample.dts,
				cts: sample.cts
			}))
		}
	});
   
	return { tracks, parsedSize };

}

class Fragmenter {

	private timescales = [0, 0];
	private headerSent: boolean = false;
	private baseMediaDecodeTimes = [0, 0];

	push = (data: Uint8Array): { data: Uint8Array, parsedSize: number } | undefined => {
		const response = [];
		const fragment = getFragmentInfo(data);
		if (!fragment) return;
		const { tracks, parsedSize } = fragment;

		if (!this.headerSent) {
			this.headerSent = true;
			for (let c = 0; c < tracks.length; c++) {
				this.timescales[c] = tracks[c].timescale;
			}
			response.push(MP4Generator.initSegment(tracks));
		}

		for (let c = 0; c < tracks.length; c++) {
			response.push(MP4Generator.fragmentSegment(this.baseMediaDecodeTimes[c], tracks[c]));
			this.baseMediaDecodeTimes[c] += this.timescales[c];
		}

		return { data: concat(response), parsedSize };
		
	}
}

export default Fragmenter;