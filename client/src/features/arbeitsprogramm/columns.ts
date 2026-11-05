import type { Zug } from '@shared/types';
import { emptyBestand, KDO_ID } from '@shared/types';
import { currentT } from '../../lib/lang';

/** The «Kdo» column shown before the Züge on every day. */
export const kdoColumn = (kpId: number): Zug => ({ id: KDO_ID, kpId, name: currentT('kdo'), order: 0, zfhrUserId: null, soll: emptyBestand(), ist: emptyBestand(), gruppen: [] });

export const withKdo = (kpId: number, zuege: Zug[]) => [kdoColumn(kpId), ...zuege];

export const columnName = (zuege: Zug[], id: number) => (id === KDO_ID ? currentT('kdo') : (zuege.find((z) => z.id === id)?.name ?? '?'));
