import * as vscode from "vscode";
import { injectable, inject } from "tsyringe";
import { QixDirectory, DirectoryItem } from "../qix/qix.directory";
import { Observable, from } from "rxjs";
import { map } from "rxjs/operators";
import { QixSheetProvider } from "@core/qix/utils/sheet.provider";
import { EntryType } from "@vsqlik/fs/data";
import { FilesystemEntry } from "@vsqlik/fs/utils/file-system.storage";
import { FileSystemHelper } from "@vsqlik/fs/utils/file-system.helper";

@injectable()
export class SheetDirectory extends QixDirectory<any> {

    public constructor(
        @inject(QixSheetProvider) private provider: QixSheetProvider,
        @inject(FileSystemHelper) private fileSystemHelper: FileSystemHelper
    ) {
        super();
    }

    protected loadData(uri: vscode.Uri): Observable<DirectoryItem<any>[]> {

        const connection = this.getConnection(uri);
        const app = connection?.fileSystemStorage.parent(uri, EntryType.APPLICATION);

        if (!app || !connection ) {
            throw new Error(`could not find app for path: ${uri.toString(true)}`);
        }

        return from(this.provider.list(connection, app.id)).pipe(
            map(
                (dimensions: any[]) => dimensions.map((sheet) => ({
                    name: sheet.qData.title,
                    id: sheet.qInfo.qId,
                    data: sheet
                }))
            )
        );
    }

    protected generateEntry(data: DirectoryItem<any>, uri: vscode.Uri): FilesystemEntry {

        const connection = this.getConnection(uri);
        const app = connection?.fileSystemStorage.parent(uri, EntryType.APPLICATION);
        const fileName = this.fileSystemHelper.createFileName(uri, data.name);

        return {
            id: data.id,
            name: fileName,
            raw: data,
            readonly: app?.readonly ?? true,
            type: EntryType.SHEET,
            fileType: vscode.FileType.File
        };
    }
}
