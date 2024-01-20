/* eslint-disable */
import Track from "./Track";

const uint32arr = (value: number) => [
	(value >> 24) & 0xFF,
	(value >> 16) & 0xFF,
	(value >> 8) & 0xFF,
	value & 0xFF,
]

const MP4Box = (type: string, ...payload: Uint8Array[]) => {

	let size = 8;

	for (const p of payload) {
		size += p.byteLength;
	}

	const result = new Uint8Array(size);
	result[0] = (size >> 24) & 0xff;
	result[1] = (size >> 16) & 0xff;
	result[2] = (size >> 8) & 0xff;
	result[3] = size & 0xff;
	result.set(type.split('').map(ch => ch.charCodeAt(0)), 4);
	size = 8;

	for (const box of payload) {
		result.set(box, size);
		size += box.byteLength;
	}

	return result;
}

const moofAtom = (baseMediaDecodeTime: number, track: Track) => MP4Box(
	'moof',
	MP4Box(
		'mfhd',
		new Uint8Array([
			0x00,
			0x00, 0x00, 0x00,
			// sequence number
			0x00, 0x00, 0x00, 0x00
		])
	),
	MP4Box(
		'traf',
		MP4Box('tfhd', new Uint8Array([
			// version
			0x00,
			// flags
			// * `AB|00000000|00CDE0FG`
			// * `A.|........|........` default-base-is-moof
			// * `.B|........|........` duration-is-empty
			// * `..|........|..C.....` default-sample-flags-present
			// * `..|........|...D....` default-sample-size-present
			// * `..|........|....E...` default-sample-duration-present
			// * `..|........|......F.` sample-description-index-present
			// * `..|........|.......G` base-data-offset-present
			0b00000000, 0x00, 0b00001000,
			// track id
			...uint32arr(track.id),
			// default_sample_duration
			...uint32arr(track.samples[0].duration),
		])),
		MP4Box('tfdt', new Uint8Array([
			// version
			0x00,
			// flags
			0x00, 0x00, 0x00,
			// base media decode time
			...uint32arr(baseMediaDecodeTime),
		])),
		MP4Box('trun', new Uint8Array([
			// version
			0x00,
			// * `ABCD|00000E0F`
			// * `A...|........` sample‐composition‐time‐offsets‐present
			// * `.B..|........` sample‐flags‐present
			// * `..C.|........` sample‐size‐present
			// * `...D|........` sample‐duration‐present
			// * `....|.....E..` first‐sample‐flags‐present
			// * `....|.......G` data-offset-present
			0x00, 0b00001010, 0b00000001,
			// number of samples
			...uint32arr(track.samples.length),
			// data offset (data-offset-present flag)
			42, 42, 42, 42,
			// sample sizes (sample‐size‐present flag)
			...track.samples.map(sample => [
				...uint32arr(sample.size),
				...uint32arr(sample.cts - sample.dts)
			]).flat(Infinity) as number[]
		]))
	)
);

const moovAtom = (tracks: Track[]) => MP4Box(
	'moov',
	MP4Box(
		'mvhd',
		new Uint8Array([
			// version
			0x00,
			// flags
			0x00, 0x00, 0x00,
			// creation time
			0x00, 0x00, 0x00, 0x00,
			// modification time
			0x00, 0x00, 0x00, 0x00,
			// timescale
			0x00, 0x00, 0x00, 0x01,
			// duration
			0x00, 0x00, 0x00, 0x00,
			// rate
			0x00, 0x01, 0x00, 0x00,
			// volume
			0x01, 0x00,
			// reserved
			0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
			// a b u (matrix structure)
			0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
			// c d v
			0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
			// x y w
			0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x00,
			// preview time
			0x00, 0x00, 0x00, 0x00,
			// preview duration
			0x00, 0x00, 0x00, 0x00,
			// poster time
			0x00, 0x00, 0x00, 0x00,
			// selection time
			0x00, 0x00, 0x00, 0x00,
			// selection duration
			0x00, 0x00, 0x00, 0x00,
			// current time
			0x00, 0x00, 0x00, 0x00,
			// next track
			0x00, 0x00, 0x00, 0x02,
		])
	),
	MP4Box(
		'mvex',
		...tracks.map(track => MP4Box(
			'trex',
			new Uint8Array([
				// flags
				0x00, 0x00, 0x00, 0x00,
				// track id
				...uint32arr(track.id),
				// default_sample_description_index
				0x00, 0x00, 0x00, 0x01,
				// default_sample_duration
				0x00, 0x00, 0x00, 0x00,
				// default_sample_size
				0x00, 0x00, 0x00, 0x00,
				// default_sample_flags;
				0x00, 0x01, 0x00, 0x00,
			])
		))
	),
	...tracks.map(track => MP4Box(
		'trak',
		MP4Box(
			'tkhd',
			new Uint8Array([
				// version
				0x00,
				// flags (0x01 - track enabled, 0x02 - track in movie, 0x04 - track in preview, 0x08 - track in poster)
				0x00, 0x00, 0x01,
				// creation time
				0x00, 0x00, 0x00, 0x00,
				// modification time
				0x00, 0x00, 0x00, 0x00,
				// track id
				...uint32arr(track.id),
				// reserved
				0x00, 0x00, 0x00, 0x00,
				// duration
				0x00, 0x00, 0x00, 0x00,
				// reserved
				0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
				// layer
				0x00, 0x00,
				// alternate group
				0x00, 0x00,
				// volume
				0x01, 0x00,
				// reserved
				0x00, 0x00,
				// a b u (matrix structure)
				0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
				// c d v 
				0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
				// x y w
				0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x00,
				// width
				0x00,0x00,0x00,0x00,
				// height
				0x00,0x00,0x00,0x00
			])
		),
		MP4Box(
			'mdia',
			MP4Box(
				'mdhd',
				new Uint8Array([
					// version
					0x00,
					// flags
					0x00, 0x00, 0x00,
					// creation time (in seconds since midnight, January 1, 1904)
					0x00, 0x00, 0x00, 0x00,
					// modification time
					0x00, 0x00, 0x00, 0x00,
					// time scale
					...uint32arr(track.timescale),
					// duration
					0x00, 0x00, 0x00, 0x00,
					// language
					0x55, 0xc4,
					// quality
					0x00, 0x00,
				])
			),
			MP4Box(
				'minf',
				MP4Box(
					'stbl',
					
					// Sample description atom
					MP4Box(
						'stsd',
						new Uint8Array([
							// version
							0x00,
							// flags
							0x00, 0x00, 0x00,
							// entry count
							0x00, 0x00, 0x00, 0x01
						]),
						new Uint8Array(track.codecData)
					),
					
					// Time-to-sample atom
					MP4Box('stts', new Uint8Array([
						0x00,
						0x00, 0x00, 0x00,
						0x00, 0x00, 0x00, 0x00,
					])),
					
					// Sample-to-chunk atom
					MP4Box('stsc', new Uint8Array([
						0x00,
						0x00, 0x00, 0x00,
						0x00, 0x00, 0x00, 0x00,
					])),
				
					// Sample Size atom
					MP4Box('stsz', new Uint8Array([
						0x00,
						0x00, 0x00, 0x00,
						0x00, 0x00, 0x00, 0x00,
						0x00, 0x00, 0x00, 0x00,
					])),
				
					// Chunk Offset atom
					MP4Box('stco', new Uint8Array([
						0x00,
						0x00, 0x00, 0x00,
						0x00, 0x00, 0x00, 0x00,
					]))
				)
			)
		)
	))
);

export default {

	initSegment: (tracks: Track[]) => {
		return moovAtom(tracks);
	},

	fragmentSegment: (baseMediaDecodeTime: number, track: Track) => {
		const moof = moofAtom(baseMediaDecodeTime, track);

		let index = -1;

		for (;;) {
			index = moof.indexOf(42, index + 1);
			if (moof[index + 1] === 42 && 
				moof[index + 2] === 42 &&
				moof[index + 3] === 42) {
				break;
			}
		}

		moof.set(uint32arr(moof.byteLength + 8), index);
		const mdat = MP4Box('mdat', track.data);
		const result = new Uint8Array(moof.byteLength + mdat.byteLength);
		result.set(moof, 0);
		result.set(mdat, moof.byteLength);
		return result;
	}
};