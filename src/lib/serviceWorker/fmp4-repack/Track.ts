/* eslint-disable */
interface Track {
	id: number;
	data: Uint8Array
	timescale: number
	codecData: Uint8Array
	samples: {
    size: number, duration: number,
    cts: number,
		dts: number
  }[];
}

export default Track;