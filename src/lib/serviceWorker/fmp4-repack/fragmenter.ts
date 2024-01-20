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

const getFragmentInfo = (data: Uint8Array): Track[] | undefined => {

   try {

	   const mp4boxfile = MP4Box.createFile();
	   const arrayBuffer = new Uint8Array(data).buffer;
	   // @ts-ignore
	   arrayBuffer.fileStart = 0;
	   mp4boxfile.appendBuffer(arrayBuffer);

   	const mdatSection = mp4boxfile.mdats[0];
	   let mdatSectionData = data.subarray(mdatSection.start + 8, mdatSection.start + mdatSection.size);

	
      const result: Track[] = mp4boxfile.moov.traks.map((trak: any) => {
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

      if ((result?.[0]?.data?.length || 0) + (result?.[1]?.data?.length || 0) !== mdatSectionData.length) {
         console.error('WRONG_DATA');
         console.info('x', (result?.[0]?.data?.length || 0) + (result?.[1]?.data?.length || 0));
         console.info('y', mdatSectionData.length)
      }
      
      return result;
   } catch (e) {
      console.info('fragmenter', e);
   }

}

class Fragmenter {

	private timescales = [0, 0];
	private headerSent: boolean = false;
	private baseMediaDecodeTimes = [0, 0];

	push = (data: Uint8Array): Uint8Array => {

		const response = [];
		const tracks = getFragmentInfo(data);
      if (!tracks) return;

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


		return concat(response);
		
	}
}

export default Fragmenter;