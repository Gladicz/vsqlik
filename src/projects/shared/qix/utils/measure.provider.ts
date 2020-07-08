import { singleton } from "tsyringe";
import { EnigmaSession } from "@shared/connection";
import { from, EMPTY, Observable, EmptyError } from "rxjs";
import { switchMap, map } from "rxjs/operators";

@singleton()
export class QixMeasureProvider {

    /**
     * resolve all measure items
     *
     * @todo add typings
     */
    public list(connection: EnigmaSession, app_id: string): Observable<any[]> {

        /** configuration for measure list object */
        const measureListConfig: EngineAPI.IGenericObjectProperties = {
            qInfo: {
                qType: 'MeasureList'
            },
            qMeasureListDef: {
                qType: 'measure',
                qData: {
                    'title': '/title'
                }
            }
        };

        return from(connection.open(app_id)).pipe(
            switchMap((global) => global?.openDoc(app_id) ?? EMPTY),
            switchMap((app) => {
                if (app) {
                    const inner$ =  from(app.createSessionObject(measureListConfig));
                    return inner$.pipe(switchMap((obj) => obj.getLayout()));
                }
                throw new Error(`could not open document: ${app_id}`);
            }),
            /** @todo add better typings, they are not correct */
            map((layout: any) => layout.qMeasureList.qItems)
        );
    }

    /**
     * read measure data
     */
    public read(connection: EnigmaSession, app: string, measure: string): Observable<any> {
        return from(connection.open(app)).pipe(
            switchMap((global) => global?.openDoc(app) ?? EmptyError),
            switchMap((app) => app ? app.getMeasure(measure) : EmptyError),
            switchMap((measure) => measure.getProperties())
        );
    }
}
