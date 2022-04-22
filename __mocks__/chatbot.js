
const chatbot_helper = function(username, password, channel) {
  return {
    client: null, // do not mock client, since it is not used outside
    connect: jest.fn(),
    setup: jest.fn(handle_func => undefined),
    say: jest.fn(message => undefined)
  };
};

module.exports = {
  helper: function(username, password, channel) {
    return chatbot_helper(username, password, channel);
  },
};
