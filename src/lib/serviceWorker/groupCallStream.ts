/* eslint-disable */
// @ts-ignore

import { serviceMessagePort } from './index.service';
import Fragmenter from './fmp4-repack/fragmenter';
import { InputGroupCall } from '../../layer';

interface RequestParams {
  call: InputGroupCall.inputGroupCall,
  last_timestamp_ms: number,
  scale: number,
  video_channel: number
}

const getCallAndChannel = (requestUrl: string): RequestParams | undefined => {
  try {
    let result: any = (new URL(requestUrl)).pathname;
    result = result.split('/').filter(Boolean).slice(1).join('/');
    result = decodeURIComponent(result);
    result = JSON.parse(result);
    const { call, channel } = result;
    if (!call || !(call instanceof Object)) return;
    let { last_timestamp_ms, scale, channel: video_channel } = channel;
    if (typeof scale !== 'number') return;
    if (typeof video_channel !== 'number') return;
    if (typeof last_timestamp_ms === 'string') {
      last_timestamp_ms = parseInt(last_timestamp_ms, 10);
    }
    if (!Number.isInteger(last_timestamp_ms)) return;
    return { call, scale, video_channel, last_timestamp_ms }
  } catch (e) {}
}

const isTgChunk = (data: Uint8Array, offset: number): boolean => {
   try {
      return (
         data[offset + 0] === 0x0D &&
         data[offset + 1] === 0x81 &&
         data[offset + 2] === 0x2E &&
         data[offset + 3] === 0xA1
      );
   } catch (e) {}
   return false;
}

const makeResponse = (requestParams: RequestParams) => new Promise<Response>(resolve => {
  const { call, last_timestamp_ms, scale, video_channel } = requestParams;

  let timeOffset = -5000;
  const fragmenter = new Fragmenter();
  let chunkOrError: Uint8Array | string = '';

//   const stream = new ReadableStream();
//   stream.

  resolve(new Response(new ReadableStream({
    start: async(controller) => {
      
      try {
        
         for (;;) {
          
            chunkOrError = await serviceMessagePort.invoke('getGroupCallStreamBlob', {
               call,
               scale,
               video_channel,
               time_ms: last_timestamp_ms + timeOffset
            });
            
            console.info(timeOffset, {chunkOrError})
          
            if (!(chunkOrError instanceof Uint8Array)) {
               if (chunkOrError.includes('TIME_TOO_BIG')) {
                 await new Promise(r => setTimeout(r, 1000));
                 continue;
               } else {
                 throw chunkOrError;
               }
            }

            let start = 0;
            while (isTgChunk(chunkOrError, start)) {
               console.info('parsing chunk', start);
               const fragment = fragmenter.push(chunkOrError.slice(start + 32));
               if (!fragment) throw 'no fragment received';
               const { data, parsedSize } = fragment;
               controller.enqueue(data);
               start += parsedSize;
            }

            await new Promise(r => setTimeout(r, 500));
            timeOffset += 1000;
         
         }

      } catch(e) {
        console.info('ERRROR', e)
      }

      console.info('CLOSE THE THING?')

      controller.close();
      controller.error();


    }

  }), {
    status: 200,
    headers: {
      'content-type': 'video/mp4',
      'connection': 'keep-alive',
      'Transfer-Encoding': 'chunked'
    }
  }));

});

export default function onGroupCallStreamFetch(event: FetchEvent) {
   const { request } = event;
   do {
      if (request.method !== 'GET') break;
      const requestParams = getCallAndChannel(request.url);
      if (!requestParams) break;
      return event.respondWith(makeResponse(requestParams));
   } while (0);
   event.respondWith(new Response('', { status: 404 }));
}