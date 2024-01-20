/* eslint-disable */
// @ts-ignore

import { serviceMessagePort } from './index.service';
import Fragmenter from './fmp4-repack/fragmenter';
import { GroupCallStreamChannel, InputGroupCall } from '../../layer';


const getCallAndChannel = (requestUrl: string): {
  call: InputGroupCall.inputGroupCall,
  channel: GroupCallStreamChannel
} | undefined => {
  try {
    let result: any = (new URL(requestUrl)).pathname;
    result = result.split('/').filter(Boolean).slice(1).join('/');
    result = decodeURIComponent(result);
    result = JSON.parse(result);
    if (result && result instanceof Object &&
        result.hasOwnProperty('call') &&
        result.hasOwnProperty('channel')) {
        return result;
      }
  } catch (e) {}
}

export default function onGroupCallStreamFetch(event: FetchEvent) {

  const request = getCallAndChannel(event.request.url);
  if (!request) return event.respondWith(new Response('', { status: 404 }));
  
  const { call, channel } = request;

  const promise = new Promise<Response>(async(resolve) => {

    let timeOffset = -5000;
    const fragmenter = new Fragmenter();

    resolve(new Response(new ReadableStream({
      start: async(controller) => {
        try {
          
         for (;;) {


            const responseOrError = await serviceMessagePort.invoke('getGroupCallStreamBlob', {
               call,
               scale: channel.scale,
               video_channel: channel.channel,
               time_ms: (
                  typeof channel.last_timestamp_ms === 'string' ? parseInt(channel.last_timestamp_ms, 10) : channel.last_timestamp_ms
               ) + timeOffset
            });

            console.info(timeOffset, {responseOrError})

            if (typeof responseOrError === 'string') {
               if (responseOrError.includes('TIME_TOO_BIG')) {
                  await new Promise(r => setTimeout(r, 1000));
                  continue;
               } else {
                  throw responseOrError;
               }
            }
            
            if (responseOrError instanceof Uint8Array) {
               const fragment = fragmenter.push(responseOrError.slice(32));
               if (!fragment) break;
              controller.enqueue(fragment);
            }

            await new Promise(r => setTimeout(r, 500));
            timeOffset += 1000;

         }
    

        } catch(e) {
          console.info('ERRROR', e)
        }
        
        controller.close();
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

  event.respondWith(promise);
  
}