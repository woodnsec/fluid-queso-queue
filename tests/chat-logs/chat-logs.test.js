'use strict';

// imports
const jestChance = require('jest-chance');
var tk = require('timekeeper');
const readline = require('readline');
const { fail } = require('assert');
const { vol } = require('memfs');
const path = require('path');
const codeFrameColumns = require('@babel/code-frame').codeFrameColumns;

// constants
const AsyncFunction = (async () => { }).constructor;
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
const pronouns = new Set([
    "Ae/Aer",
    "Any",
    "E/Em",
    "Fae/Faer",
    "He/Him",
    "He/She",
    "He/They",
    "It/Its",
    "Other",
    "Per/Per",
    "She/Her",
    "She/They",
    "They/Them",
    "Ve/Ver",
    "Xe/Xem",
    "Zie/Hir"
]);

// mock variables
var mockChatters = undefined;
var mockTime = undefined;

// mocks
jest.mock('../../chatbot.js');
jest.mock('node-fetch', () => jest.fn());
jest.mock('fs');
jest.mock('../../settings.js', () => { return { ...defaultTestSettings }; });

// only import after mocking!
const fetch = require("node-fetch");
const fs = jest.requireActual('fs');
const settings = require("../../settings.js");

// mock fetch
fetch.mockImplementation(() =>
    Promise.resolve({
        json: () => Promise.resolve(mockChatters),
    })
);

// fake timers
jest.useFakeTimers();

const setTime = (time) => {
    const newTime = new Date(`2022-04-21T${time}Z`);
    const diff = newTime - mockTime;
    if (diff > 0) {
        jest.advanceTimersByTime(diff);
    } else if (diff < 0) {
        fail(`Time went backwards, from ${mockTime} to ${newTime} (${time})`);
    }
    mockTime = newTime;
    tk.freeze(mockTime);
}

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
    // reset virtual file system
    vol.reset();
});
// load index.js and test it being setup correctly
const requireIndex = () => {
    let index;
    let fs;

    jest.isolateModules(() => {
        index = require('../../index.js');
        fs = require('fs');
        fs.mkdirSync(path.resolve('.'), { recursive: true });
    });

    const chance = jestChance.getChance();

    const random = jest
        .spyOn(global.Math, 'random')
        .mockImplementation(() => {
            return chance.random();
        });

    expect(index.chatbot_helper.setup.mock.calls.length).toBe(1);
    expect(index.chatbot_helper.connect.mock.calls.length).toBe(1);
    expect(index.chatbot_helper.setup.mock.calls[0].length).toBe(1);
    expect(index.chatbot_helper.say.mock.calls.length).toBe(0);
    expect(index.chatbot_helper.setup.mock.calls[0][0]).toBeInstanceOf(AsyncFunction);

    return {
        handle_func: index.chatbot_helper.setup.mock.calls[0][0],
        random: random,
        fs: fs,
        settings: settings,
        ...index
    };
};

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
        twitch = require('../../twitch.js').twitch();
        settings = require('../../settings.js');
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


test('setup', () => {
    const index = requireIndex();
    var handler = index.handle_func;
});

const parseMessage = (line) => {
    const idx = line.indexOf(':');
    var user = line.substring(0, idx).trim();
    var message = line.substring(idx + 1);
    var isBroadcaster = false;
    var isMod = false;
    var isSubscriber = false;
    var username = undefined;
    while (true) {
        if (user.startsWith('~')) {
            isBroadcaster = true;
        } else if (user.startsWith('@')) {
            isMod = true;
        } else if (user.startsWith('%')) {
            isSubscriber = true;
        } else if (user.startsWith('+') || user.startsWith('$')
            || user.startsWith('^') || user.startsWith('*')
            || user.startsWith('!') || user.startsWith('&')
            || user.startsWith('\'') || user.startsWith('?')) {
            // nothing to set
        } else {
            break;
        }
        user = user.substring(1);
    }
    // find username
    while (user.endsWith(')')) {
        const idx = user.lastIndexOf('(');
        const maybeUsername = user.substring(idx + 1, user.length - 1).trim();
        user = user.substring(0, idx).trim();
        if (!pronouns.has(maybeUsername)) {
            // found username!
            username = maybeUsername;
        }
    }
    var displayName = user;
    if (username === undefined) {
        username = displayName.toLowerCase();
    }
    let column = message.length;
    message = message.trimStart();
    column -= message.length;
    let trimLen = message.length;
    message = message.trimEnd();
    trimLen -= message.length;
    return {
        message: message.trim(),
        sender: build_chatter(username, displayName, isSubscriber, isMod, isBroadcaster),
        column: idx + 2 + column,
        trimLen: trimLen,
    };
}

const testFiles = fs.readdirSync(path.resolve(__dirname, 'logs')).filter(file => file.endsWith('.test.log'));

for (const file of testFiles) {
    
    const fileName = path.relative('.', path.resolve(__dirname, `logs/${file}`));
    test(fileName, async () => {
        const index = requireIndex();
        var handler = index.handle_func;

        var replyMessageQueue = [];

        function pushMessageWithStack(message) {
            let error = new Error("<Stack Trace Capture>");
            Error.captureStackTrace(error, pushMessageWithStack);
            replyMessageQueue.push({ message: message, error: error });
        }

        index.chatbot_helper.say.mockImplementation(pushMessageWithStack);

        const fileStream = fs.createReadStream(fileName);

        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        var lineno = 0;
        for await (var line of rl) {
            lineno++;
            if (line.trim().startsWith('#') || line.trim().startsWith('//') || !line) {
                continue;
            }
            const idx = line.indexOf(' ');
            const command = line.substring(0, idx);
            const rest = line.substring(idx + 1);
            if (command == 'settings') {
                replaceSettings(index.settings, JSON.parse(rest));
            } else if (command == 'chatters') {
                setChatters(JSON.parse(rest));
            } else if (command == 'queso.save') {
                expect(JSON.parse(index.fs.readFileSync(path.resolve(__dirname, '../../queso.save')))).toEqual(JSON.parse(rest))
            } else if (command == 'seed') {
                const chance = jestChance.getChance(rest);
                index.random
                    .mockImplementation(() => {
                        return chance.random();
                    });
            } else if (command == 'random') {
                index.random
                    .mockImplementationOnce(() => parseFloat(rest));
            } else if (command.startsWith('[') && command.endsWith(']')) {
                setTime(command.substring(1, command.length - 1));
                // const time = new Date();
                const chat = parseMessage(rest);
                // console.log(`${time}`, chat.sender, 'sends', chat.message);
                if (chat.sender.username == index.settings.username.toLowerCase()) {
                    // this is a message by the chat bot, check replyMessageQueue
                    let shift = replyMessageQueue.shift();
                    let errorMessage = () => {
                        let position = {
                            start: { column: idx + 1 + chat.column, line: lineno },
                            end: { column: line.length + 1 - chat.trimLen, line: lineno }
                        };
                        let contents = codeFrameColumns(fs.readFileSync(fileName).toString(), position);
                        return '\n\n' + `given in test file ${fileName}:${lineno}` + '\n' + contents;
                    }
                    if (shift === undefined) {
                        try {
                            expect(replyMessageQueue).toContain(chat.message);
                        } catch (error) {
                            error.message += errorMessage();
                            throw error;
                        }
                    }
                    try {
                        expect(shift.message).toBe(chat.message);
                    } catch (error) {
                        error.stack = shift.error.stack.replace(shift.error.message, error.message + errorMessage());
                        throw error;
                    }
                } else {
                    await handler(chat.message, chat.sender, index.chatbot_helper.say);
                }
            } else {
                fail(`unexpected line "${line}" in file ${fileName}`);
            }
        }
        // replyMessageQueue should be empty now!
        try {
            expect(replyMessageQueue.map(m => m.message)).toEqual([]);
        } catch (error) {
            let shift = replyMessageQueue.shift();
            error.stack = shift.error.stack.replace(shift.error.message, error.message + '\n\n' + `not given in test file ${fileName}`);
            throw error;
        }
    });
}
