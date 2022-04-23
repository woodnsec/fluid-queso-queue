'use strict';

// imports
var tk = require('timekeeper');

// constants
const defaultTestChatters = {
    _links: {},
    chatter_count: 0,
    chatters: { broadcaster: [], vips: [], moderators: [], staff: [], admins: [], global_mods: [], viewers: [] }
};
const defaultTestSettings = {
    username: 'queso_queue_test_username',
    password: '',
    channel: 'queso_queue_test_channel',
    max_size: 50,
    level_timeout: 10,
    level_selection: ['next', 'subnext', 'modnext', 'random', 'subrandom', 'modrandom'],
    message_cooldown: 5,
};

// mock variables
var mockChatters = undefined;
var mockTime = undefined;

// mocks
jest.mock('node-fetch', () => jest.fn());
jest.mock('../settings.js', () => { return { ...defaultTestSettings }; });

// only import after mocking!
const fetch = require("node-fetch");
const settings = require('../settings.js');

// mock fetch
fetch.mockImplementation(() =>
    Promise.resolve({
        json: () => Promise.resolve(mockChatters),
    })
);

// fake timers
jest.useFakeTimers();

const replaceSettings = (settings, newSettings) => {
    Object.keys(settings).forEach(key => { delete settings[key]; });
    Object.assign(settings, newSettings);
};

const setChatters = (newChatters) => {
    // automatically create a correct chatters object
    if (!newChatters.hasOwnProperty('chatters')) {
        newChatters = {
            _links: {},
            chatter_count: Object.values(newChatters).flat().length,
            chatters: newChatters
        };
    }
    mockChatters = newChatters;
};

beforeEach(() => {
    fetch.mockClear();
    setChatters(defaultTestChatters);
    replaceSettings(settings, defaultTestSettings);
    // fake time
    mockTime = new Date('2022-04-21T00:00:00Z');
    tk.freeze(mockTime);
});

const build_chatter = function (username, displayName, isSubscriber, isMod, isBroadcaster) {
    return {
        username: username,
        displayName: displayName,
        isSubscriber: isSubscriber,
        isMod: isMod,
        isBroadcaster: isBroadcaster
    }
}

test('online users', async () => {
    let twitch;
    let settings;
    jest.isolateModules(() => {
        twitch = require('../twitch.js').twitch();
        settings = require('../settings.js');
    });

    expect(settings.channel).toBe('queso_queue_test_channel');

    // online users should be empty
    await expect(twitch.getOnlineUsers(settings.channel)).resolves.toEqual(new Set([]));

    // change chatters mock and compare with result
    setChatters({ broadcaster: ['liquidnya'], vips: ['redzebra_'], moderators: ['helperblock'], staff: [], admins: [], global_mods: [], viewers: [] });
    await expect(twitch.getOnlineUsers(settings.channel)).resolves.toEqual(new Set(['liquidnya', 'helperblock', 'redzebra_']));

    tk.freeze(new Date('2022-04-21T00:00:00Z'));
    // notice chatter
    twitch.noticeChatter(build_chatter('furretwalkbot', 'FurretWalkBot', false, true, false));
    await expect(twitch.getOnlineUsers(settings.channel)).resolves.toEqual(new Set(['liquidnya', 'helperblock', 'redzebra_', 'furretwalkbot']));

    // after 4 minutes still online!
    tk.freeze(new Date('2022-04-21T00:04:00Z'));
    await expect(twitch.getOnlineUsers(settings.channel)).resolves.toEqual(new Set(['liquidnya', 'helperblock', 'redzebra_', 'furretwalkbot']));

    // after 5 minutes not online any longer
    tk.freeze(new Date('2022-04-21T00:05:00Z'));
    await expect(twitch.getOnlineUsers(settings.channel)).resolves.toEqual(new Set(['liquidnya', 'helperblock', 'redzebra_']));

    // test the lurking feature
    twitch.setToLurk('helperblock');
    await expect(twitch.getOnlineUsers(settings.channel)).resolves.toEqual(new Set(['liquidnya', 'redzebra_']));
    // even when they still chat, they are not online
    twitch.noticeChatter(build_chatter('helperblock', 'helperblock', false, true, false));
    await expect(twitch.getOnlineUsers(settings.channel)).resolves.toEqual(new Set(['liquidnya', 'redzebra_']));

    // unlurk makes them online again!
    twitch.notLurkingAnymore('helperblock');
    await expect(twitch.getOnlineUsers(settings.channel)).resolves.toEqual(new Set(['liquidnya', 'helperblock', 'redzebra_']));

    // the twitch api has been called 8 times
    expect(fetch.mock.calls.length).toBe(8);

});