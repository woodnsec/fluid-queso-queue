'use strict';

// imports
const jestChance = require('jest-chance');
const { Volume, createFsFromVolume } = require('memfs');
const path = require('path');

// constants
const START_TIME = new Date('2022-04-21T00:00:00Z'); // every test will start with this time
const DEFAULT_TEST_SETTINGS = {
    username: 'queso_queue_test_username',
    password: 'oauth:test',
    channel: 'queso_queue_test_channel',
    max_size: 50,
    level_timeout: 10,
    level_selection: ['next', 'subnext', 'modnext', 'random', 'subrandom', 'modrandom'],
    message_cooldown: 5,
};
// constants
const EMPTY_CHATTERS = {
    _links: {},
    chatter_count: 0,
    chatters: { broadcaster: [], vips: [], moderators: [], staff: [], admins: [], global_mods: [], viewers: [] }
};
// async function type
const AsyncFunction = (async () => { }).constructor;

// mock variables
var mockChatters = EMPTY_CHATTERS;

// mocks
jest.mock('../chatbot.js');
jest.mock('node-fetch', () => jest.fn());

// only import after mocking!
const fetch = require("node-fetch");

// mock fetch
fetch.mockImplementation(() =>
    Promise.resolve({
        json: () => Promise.resolve(mockChatters),
    })
);

/**
 * @param {Object} newChatters chatters as returned by the chatters resource, see `../twitch.js`
 */
const simSetChatters = (newChatters) => {
    // automatically create a correct chatters object
    if (!Object.hasOwnProperty.call(newChatters, 'chatters')) {
        newChatters = {
            _links: {},
            chatter_count: Object.values(newChatters).flat().length,
            chatters: newChatters
        };
    }
    mockChatters = newChatters;
};

const createMockFs = () => {
    const volume = new Volume();
    volume.mkdirSync(path.resolve('.'), { recursive: true });
    return volume;
};

/**
 * @typedef { import("../settings.js").settings } settings
 */

/**
 * @typedef index
 * @property {Volume} fs file system
 * @property {settings} settings settings 
 * @property {Object} chatbot the chatbot mock
 * @property {Object} chatbot_helper the chatbot instance that `index.js` is using
 * @property {function():number} random the Math.random mock
 * @property {Object} quesoqueue the queue instance that `index.js` is using
 * @property {function(string, {username: string; displayName: string; isSubscriber: boolean; isMod: boolean; isBroadcaster: boolean;}, function(string):void):void} handle_func the function of the chatbot that receives chat messages
*/

/**
 * load `index.js` and test it being setup correctly
 * 
 * @param {Volume | undefined} mockFs This virtual file system will be copied over
 * @param {settings | undefined} mockSettings {@link settings} Settings to be used
 * @param {number | Date} mockTime 
 * @returns {index} {@link index} 
 */
function simRequireIndex(mockFs = undefined, mockSettings = undefined, mockTime = undefined) {
    let fs;
    let settings;
    let chatbot;
    let chatbot_helper;
    let random;
    let quesoqueue;
    let handle_func;

    try {
        jest.isolateModules(() => {
            // remove timers
            jest.clearAllTimers();

            // setup time
            jest.useFakeTimers();

            if (mockTime !== undefined) {
                jest.setSystemTime(mockTime);
            } else {
                jest.setSystemTime(START_TIME);
            }

            // setup random mock
            const chance = jestChance.getChance();
            random = jest
                .spyOn(global.Math, 'random')
                .mockImplementation(() => {
                    return chance.random();
                });

            // create virtual file system
            if (mockFs === undefined) {
                mockFs = createMockFs();
            } else {
                // copy files
                const files = mockFs.toJSON();
                mockFs = new Volume();
                mockFs.fromJSON(files);
            }
            // setup virtual file system
            const mockFsAsFs = createFsFromVolume(mockFs);
            jest.mock('fs', () => mockFsAsFs);
            fs = require('fs');

            // write settings.json file
            if (mockSettings === undefined) {
                mockSettings = DEFAULT_TEST_SETTINGS;
            }
            mockFs.writeFileSync('./settings.json', JSON.stringify(mockSettings));
            // import settings
            settings = require('../settings.js');

            // import libraries
            chatbot = require('../chatbot.js');
            const queue = require('../queue.js');

            // spy on the quesoqueue that index will use
            const quesoqueueSpy = jest.spyOn(queue, 'quesoqueue');

            // run index.js
            require('../index.js');

            // get hold of the queue
            expect(quesoqueueSpy).toHaveBeenCalledTimes(1);
            quesoqueue = quesoqueueSpy.mock.results[0].value;
            quesoqueueSpy.mockRestore();

            // get hold of chatbot_helper
            expect(chatbot.helper).toHaveBeenCalledTimes(1);
            chatbot_helper = chatbot.helper.mock.results[0].value;

            expect(chatbot_helper.setup).toHaveBeenCalledTimes(1)
            expect(chatbot_helper.connect).toHaveBeenCalledTimes(1);
            expect(chatbot_helper.setup).toHaveBeenCalledTimes(1);
            expect(chatbot_helper.say).toHaveBeenCalledTimes(0);

            // get hold of the handle function
            // the first argument of setup has to be an AsyncFunction
            expect(chatbot_helper.setup.mock.calls[0][0]).toBeInstanceOf(AsyncFunction);
            handle_func = chatbot_helper.setup.mock.calls[0][0];
        });
    } catch (err) {
        err.simIndex = {
            fs,
            mockFs,
            settings,
            chatbot,
            chatbot_helper,
            random,
            quesoqueue,
            handle_func,
        };
        throw err;
    }

    return {
        fs,
        mockFs,
        settings,
        chatbot,
        chatbot_helper,
        random,
        quesoqueue,
        handle_func,
    };
};

const flushPromises = () => {
    return new Promise(resolve => jest.requireActual('timers').setImmediate(resolve));
};

/**
 * Advances time and runs timers.
 * Waits for async timers to run.
 * 
 * @param {number} ms How many milliseconds to advance time
 * @param {number} accuracy How accurate timers are being simulated, in milliseconds
 */
const simAdvanceTime = async (ms, accuracy = 0) => {
    // advance by accuracy intervals
    if (accuracy > 0) {
        for (let i = 0; i < ms; i += accuracy) {
            const advance = Math.min(accuracy, ms - i);
            jest.advanceTimersByTime(advance);
            await flushPromises();
            await Promise.resolve();
        }
    } else {
        jest.advanceTimersByTime(ms);
        await flushPromises();
        await Promise.resolve();
    }
};

/**
 * Sets the time to the given time and adds a day in case time would have gone backwards.
 * Also runs timers and waits for async timers to run.
 * 
 * @param {string} time Time in the format `HH:mm:ss` in UTC.
 * @param {number} accuracy How accurate timers are being simulated, in milliseconds
 */
const simSetTime = async (time, accuracy = 0) => {
    const prevTime = new Date();
    const newTime = new Date();
    const timeArray = time.split(':').map(x => parseInt(x, 10));
    newTime.setUTCHours(timeArray[0]);
    newTime.setUTCMinutes(timeArray[1]);
    newTime.setUTCSeconds(timeArray[2]);
    if (newTime < prevTime) {
        // add one day in case of time going backwards
        newTime.setUTCDate(newTime.getUTCDate() + 1);
    }
    const diff = newTime - prevTime;
    if (diff > 0) {
        await simAdvanceTime(diff, accuracy);
    } else if (diff < 0) {
        // should not happen
        throw Error(`Time went backwards, from ${prevTime} to ${newTime} (${time})`);
    }
}

const buildChatter = function (username, displayName, isSubscriber, isMod, isBroadcaster) {
    return { username, displayName, isSubscriber, isMod, isBroadcaster };
}

module.exports = {
    simRequireIndex,
    simAdvanceTime,
    simSetTime,
    simSetChatters,
    buildChatter,
    createMockFs,
    flushPromises,
    fetchMock: fetch,
    START_TIME,
    DEFAULT_TEST_SETTINGS,
    EMPTY_CHATTERS
};
