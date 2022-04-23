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
    var newTime = new Date(`2022-04-21T${time}Z`);
    var diff = newTime - mockTime;
    if (diff < 0) {
        // add one day in case of time going backwards
        // TODO: do this better
        newTime = new Date(`2022-04-22T${time}Z`);
        diff = newTime - mockTime;
    }

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
function requireIndex(mockOriginalFs = undefined) {
    let fs;
    let settings;
    let chatbot;
    let chatbot_helper;
    let random;
    let quesoqueue;
    let handle_func;

    jest.isolateModules(() => {
        // setup random mock
        const chance = jestChance.getChance();
        random = jest
            .spyOn(global.Math, 'random')
            .mockImplementation(() => {
                return chance.random();
            });

        // reuse filesystem when restarting
        if (mockOriginalFs !== undefined) {
            jest.mock('fs', () => mockOriginalFs);
        }

        // setup virtual file system
        fs = require('fs');
        // make sure that the folder '.' exists in the virtual file system
        // which is the folder that contains './queso.save'
        fs.mkdirSync(path.resolve('.'), { recursive: true });

        // import libraries
        settings = require('../../settings.js');
        chatbot = require('../../chatbot.js');
        const queue = require('../../queue.js');

        // spy on the quesoqueue that index will use
        const quesoqueueSpy = jest.spyOn(queue, 'quesoqueue');

        // run index.js
        require('../../index.js');

        // get hold of the queue
        expect(quesoqueueSpy).toHaveBeenCalledTimes(1);
        quesoqueue = quesoqueueSpy.mock.results[0].value;
        quesoqueueSpy.mockRestore();
    });

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

    return {
        handle_func: handle_func,
        random: random,
        fs: fs,
        settings: settings,
        chatbot_helper: chatbot_helper,
        quesoqueue: quesoqueue,
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

test('setup', () => {
    requireIndex();
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
        var index = requireIndex();
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

        let errorMessage = (position) => {
            let contents = codeFrameColumns(fs.readFileSync(fileName).toString(), position);
            return '\n\n' + `given in test file ${fileName}:${lineno}` + '\n' + contents;
        }

        var lineno = 0;
        for await (var line of rl) {
            lineno++;
            if (line.trim().startsWith('#') || line.trim().startsWith('//') || !line) {
                continue;
            }
            const idx = line.indexOf(' ');
            const command = idx == -1 ? line : line.substring(0, idx);
            const rest = idx == -1 ? undefined : line.substring(idx + 1);
            let position = () => {
                return {
                    start: { column: idx + 2, line: lineno },
                    end: { column: line.length + 1, line: lineno }
                };
            };
            if (command == 'restart') {
                index = requireIndex(index.fs);
                handler = index.handle_func;
                index.chatbot_helper.say.mockImplementation(pushMessageWithStack);
            } else if (command == 'settings') {
                replaceSettings(index.settings, JSON.parse(rest));
            } else if (command == 'chatters') {
                setChatters(JSON.parse(rest));
            } else if (command == 'queso.save') {
                try {
                    expect(JSON.parse(index.fs.readFileSync(path.resolve(__dirname, '../../queso.save')))).toEqual(JSON.parse(rest));
                } catch (error) {
                    error.message += errorMessage(position());
                    throw error;
                }
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
                position = () => {
                    return {
                        start: { column: idx + 1 + chat.column, line: lineno },
                        end: { column: line.length + 1 - chat.trimLen, line: lineno }
                    };
                };
                // console.log(`${time}`, chat.sender, 'sends', chat.message);
                if (chat.sender.username == index.settings.username.toLowerCase()) {
                    // this is a message by the chat bot, check replyMessageQueue
                    let shift = replyMessageQueue.shift();
                    if (shift === undefined) {
                        try {
                            expect(replyMessageQueue).toContain(chat.message);
                        } catch (error) {
                            error.message += errorMessage(position());
                            throw error;
                        }
                    }
                    try {
                        expect(shift.message).toBe(chat.message);
                    } catch (error) {
                        error.stack = shift.error.stack.replace(shift.error.message, error.message + errorMessage(position()));
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
