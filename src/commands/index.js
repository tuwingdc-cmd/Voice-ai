// ============================================================
//         COMMAND HANDLERS ROUTER
// ============================================================

const renderCommands = require('./renderCommands');
const githubCommands = require('./githubCommands');

module.exports = {
    handleRenderCommand: renderCommands.handle,
    handleGitHubCommand: githubCommands.handle
};
