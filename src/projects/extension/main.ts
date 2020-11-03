import "reflect-metadata";
import * as vscode from "vscode";
import { container } from "tsyringe";

import { SettingsUpdateCommand } from "@settings";
import { VsQlikLoggerGlobal } from "@vsqlik/logger";
import { ConnectionModule } from "@vsqlik/connection";
import { QixFsModule } from "@vsqlik/qixfs";
import { ScriptModule } from "@vsqlik/script";

import { ExtensionContext, VsQlikServerSettings, VsQlikDevSettings, QlikOutputChannel } from "./data/tokens";
import { spawn } from "child_process";

import path from "path";
import  electron from "electron";

/**
 * bootstrap extension
 */
export function activate(context: vscode.ExtensionContext): void {

    /** register global environment variables */
    container.register(ExtensionContext, {useValue: context});
    container.register(VsQlikServerSettings, {useValue: "VsQlik.Servers"});
    container.register(VsQlikDevSettings, {
        useFactory: () => vscode.workspace.getConfiguration().get('VsQlik.Developer')
    });

    const envVars = JSON.parse(JSON.stringify(process.env));
    delete envVars.ELECTRON_RUN_AS_NODE;
    delete envVars.ATOM_SHELL_INTERNAL_RUN_AS_NODE;

    const commandPath = path.join(__dirname, '../node_modules/.bin/electron');
    const appPath     = path.join(__dirname, '../projects/electron/main.js');

    const p = spawn(commandPath, [appPath], {
        env: envVars,
        stdio: 'inherit',
        cwd: path.dirname(commandPath)
    });

    p.on("error", (error) => {
        container.resolve(VsQlikLoggerGlobal).error(error.message);
    });

    container.register(QlikOutputChannel, { useFactory: outputChannelFactory() });

    /** resolve modules */
    const connectionModule = container.resolve(ConnectionModule);
    const qixFsModule      = container.resolve(QixFsModule);
    const scriptModule     = container.resolve(ScriptModule);

    /** bootstrap modules */
    connectionModule.bootstrap();
    qixFsModule.bootstrap();
    scriptModule.bootstrap();

    /** initialize modules */
    connectionModule.initialize();

    registerCommands(context);

    container.resolve(VsQlikLoggerGlobal).info(`extension activated`);
}

/**
 * register custom commands
 */
function registerCommands(context: vscode.ExtensionContext) {
    /** register commands */
    context.subscriptions.push(vscode.commands.registerCommand('VsQlik.Settings.Update', SettingsUpdateCommand));
}

function outputChannelFactory(): () => vscode.OutputChannel {
    let channel: vscode.OutputChannel;
    return () => {
        if (!channel) {
            channel = vscode.window.createOutputChannel(`Qlik`);
        }
        return channel;
    };
}

export function deactivate(): void {
    /** @todo implement */
    container.resolve(VsQlikLoggerGlobal).info(`deactivate extension`);
}
