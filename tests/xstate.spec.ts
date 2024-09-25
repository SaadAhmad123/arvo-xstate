import { createActor, createMachine, setup } from 'xstate';
import ArvoXState from '../src/ArvoXState'
import { ArvoContract, createArvoContract, createArvoEvent } from 'arvo-core';
import { z } from 'zod';


describe('xstate', () => {
  /**
   * This OpenAI machine initially execpts a user input. It then 
   * emits an ArvoEvent to invoke a fictisious OpenAI completions
   * service and then expects to recvied an event and then finishes.
   */
  const openAiMachine = ArvoXState.setup({
    types: {
      context: {} as {
        request: string
        llm: {
          response: string
        }
      },
      events: {} as {type: 'saad'} | {type: 'ahmad'}
    },
    actions: {
      a: ({context, event}) => {
      
      }
    },
  }).createMachine({
    /** @xstate-layout N4IgpgJg5mDOIC5gF8A0IB2B7CdGlgBcAnASwynxAActZTDSsMqAPRAWgDZ0BPTrsjQgiZCgDpSEADZgqteo2ZtEAFgBMfRAA4AjOICsQoUA */
    version: '1.0.0',
    id: 'string',
    context: () => ({
      name: null,
      age: null,
    }),
    initial: 'idle',
    states: {
      idle: {
        type: 'final',
        entry: [
          {
            type: 'emitArvoEvent',
            params: ({context}) => createArvoEvent({
              type: 'com.example.event',
              source: '/example/source',
              subject: 'example-subject',
              data: { key: 'value' }
              
            })
          }
        ],
      },
    },
  });


  it("s", () => {
    const actor = createActor(machine)
    actor.start()
    actor.stop()
    console.log(JSON.stringify(actor.getPersistedSnapshot()))
  })

});
