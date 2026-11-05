import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Bestand, GruppeInput, Kompanie, Role, UserRow, Zug } from '@shared/types';
import { BESTAND_KEYS, BESTAND_LABEL, bestandTotal, ROLE_LABEL, sumBestand } from '@shared/types';
import { canEditZugAssignment, canManageOrg, canManageUser } from '@shared/permissions';
import { api } from '../api';
import { useUser } from '../auth';
import { Button, Card, Empty, errMsg, Field, Modal, useToast } from '../components/ui';

export function AdminPage() {
  const me = useUser();
  const qc = useQueryClient();
  const toast = useToast();
  const org = useQuery({ queryKey: ['org'], queryFn: api.org });
  const [editUser, setEditUser] = useState<Partial<UserRow> | null>(null);
  const [newKp, setNewKp] = useState('');

  if (!org.data) return <div className="p-6 text-slate-500">Laden …</div>;
  const { kompanien, zuege, users } = org.data;

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ['org'] });
    } catch (e) {
      toast(errMsg(e), 'error');
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-5 p-6">
        <h1 className="text-xl font-semibold">Kompanien & Personal – {org.data.bataillon.name}</h1>

        <Card
          title="Kompanien und Züge"
          actions={
            canManageOrg(me) && (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newKp.trim()) run(() => api.createKp(newKp.trim())).then(() => setNewKp(''));
                }}
              >
                <input className="input !w-44" placeholder="Neue Kompanie" value={newKp} onChange={(e) => setNewKp(e.target.value)} />
                <Button type="submit">Hinzufügen</Button>
              </form>
            )
          }
        >
          <div className="space-y-4">
            {kompanien.map((k) => (
              <KpPanel key={k.id} kp={k} zuege={zuege.filter((z) => z.kpId === k.id)} users={users} run={run} onEdit={setEditUser} />
            ))}
            {kompanien.length === 0 && <Empty>Keine Kompanien.</Empty>}
          </div>
        </Card>

        <Card
          title="Benutzer"
          actions={
            <Button variant="primary" onClick={() => setEditUser({ role: me.role === 'BAT' ? 'KPKDT' : 'KADER', kpId: me.kpId, zugId: null, funktion: '' })}>
              + Benutzer
            </Button>
          }
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-1 pr-2">Name</th>
                <th className="py-1 pr-2">E-Mail</th>
                <th className="py-1 pr-2">Rolle</th>
                <th className="py-1 pr-2">Funktion</th>
                <th className="py-1 pr-2">Kp / Zug</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-slate-100">
                  <td className="py-1.5 pr-2 font-medium">{u.name}</td>
                  <td className="py-1.5 pr-2 text-slate-600">{u.email}</td>
                  <td className="py-1.5 pr-2">
                    {u.role === 'ZFHR' && u.zugId && zuege.find((z) => z.id === u.zugId)?.zfhrUserId !== u.id ? 'Zfhr Stv' : ROLE_LABEL[u.role]}
                  </td>
                  <td className="py-1.5 pr-2 text-slate-600">{u.funktion}</td>
                  <td className="py-1.5 pr-2 text-slate-600">
                    {[kompanien.find((k) => k.id === u.kpId)?.name, zuege.find((z) => z.id === u.zugId)?.name].filter(Boolean).join(' / ')}
                  </td>
                  <td className="py-1.5 text-right">
                    {canManageUser(me, u) && (
                      <>
                        <Button variant="ghost" className="text-xs" onClick={() => setEditUser(u)}>
                          Bearbeiten
                        </Button>
                        {u.id !== me.id && (
                          <Button variant="ghost" className="text-xs text-red-600" onClick={() => confirm(`${u.name} löschen?`) && run(() => api.deleteUser(u.id))}>
                            Löschen
                          </Button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {editUser && (
        <UserDialog
          user={editUser}
          onClose={() => setEditUser(null)}
          onSave={(u, password) =>
            run(async () => {
              if (u.id) await api.updateUser(u.id, { ...u, ...(password ? { password } : {}) });
              else await api.createUser({ ...(u as UserRow), password });
              setEditUser(null);
            })
          }
        />
      )}
    </div>
  );
}

function UserDialog({ user, onClose, onSave }: { user: Partial<UserRow>; onClose: () => void; onSave: (u: Partial<UserRow>, password: string) => void }) {
  const me = useUser();
  const org = useQuery({ queryKey: ['org'], queryFn: api.org });
  const [u, setU] = useState(user);
  const [password, setPassword] = useState('');
  const roles: Role[] = me.role === 'BAT' ? ['BAT', 'KPKDT', 'LOGOF', 'ZFHR', 'KADER'] : ['LOGOF', 'ZFHR', 'KADER'];
  const kps = (org.data?.kompanien ?? []).filter((k) => me.role === 'BAT' || k.id === me.kpId);
  const zuege = (org.data?.zuege ?? []).filter((z) => z.kpId === u.kpId);
  const valid = u.name && u.email && u.role && (u.role === 'BAT' || u.kpId) && (u.id || password.length >= 8);

  return (
    <Modal
      title={u.id ? 'Benutzer bearbeiten' : 'Neuer Benutzer'}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" disabled={!valid} onClick={() => onSave(u, password)}>
            Speichern
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name (Grad Name)">
          <input className="input" value={u.name ?? ''} onChange={(e) => setU({ ...u, name: e.target.value })} />
        </Field>
        <Field label="E-Mail">
          <input className="input" type="email" value={u.email ?? ''} onChange={(e) => setU({ ...u, email: e.target.value })} />
        </Field>
        <Field label="Rolle">
          <select className="input" value={u.role} onChange={(e) => setU({ ...u, role: e.target.value as Role })}>
            {roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Funktion">
          <input className="input" value={u.funktion ?? ''} onChange={(e) => setU({ ...u, funktion: e.target.value })} placeholder="z. B. Grfhr Pi Z 1" />
        </Field>
        {u.role !== 'BAT' && (
          <Field label="Kompanie">
            <select className="input" value={u.kpId ?? ''} onChange={(e) => setU({ ...u, kpId: e.target.value ? Number(e.target.value) : null, zugId: null })}>
              <option value="">–</option>
              {kps.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {(u.role === 'ZFHR' || u.role === 'KADER' || u.role === 'LOGOF') && (
          <Field label="Zug">
            <select className="input" value={u.zugId ?? ''} onChange={(e) => setU({ ...u, zugId: e.target.value ? Number(e.target.value) : null })}>
              <option value="">–</option>
              {zuege.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label={u.id ? 'Neues Passwort (optional)' : 'Passwort (mind. 8 Zeichen)'} className="col-span-2">
          <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

type Run = (fn: () => Promise<unknown>) => Promise<void>;

/** A Kompanie with its Kommando and, per Zug, the Zugführer and Kader – all editable in place. */
function KpPanel({ kp, zuege, users, run, onEdit }: { kp: Kompanie; zuege: Zug[]; users: UserRow[]; run: Run; onEdit: (u: Partial<UserRow>) => void }) {
  const me = useUser();
  const [assign, setAssign] = useState<{ zug: Zug | null; role: Role } | null>(null);
  const [bestandOf, setBestandOf] = useState<Zug | null>(null);
  const [gruppenOf, setGruppenOf] = useState<Zug | null>(null);
  const kpUsers = users.filter((u) => u.kpId === kp.id);
  const editZuege = canEditZugAssignment(me, kp.id);
  const kommando = kpUsers.filter((u) => u.role === 'KPKDT' || (u.role === 'LOGOF' && u.zugId === null));
  const ohneZug = kpUsers.filter((u) => (u.role === 'ZFHR' || u.role === 'KADER') && u.zugId === null);
  const newPerson = (role: Role, zugId: number | null) => onEdit({ role, kpId: kp.id, zugId, funktion: '' });

  return (
    <div className="rounded-md border border-slate-200">
      <div className="flex flex-wrap items-center gap-2 border-b bg-slate-50 px-3 py-2">
        <h3 className="font-semibold">{kp.name}</h3>
        {zuege.length > 0 && (
          <span className="text-xs text-slate-500">
            Bestand Soll {bestandTotal(sumBestand(zuege.map((z) => z.soll)))} · Ist {bestandTotal(sumBestand(zuege.map((z) => z.ist)))}
          </span>
        )}
        <span className="flex-1" />
        {canManageOrg(me) && (
          <>
            <Button
              variant="ghost"
              className="text-xs"
              onClick={() => {
                const name = prompt('Neuer Name', kp.name);
                if (name) run(() => api.updateKp(kp.id, name));
              }}
            >
              Umbenennen
            </Button>
            <Button variant="ghost" className="text-xs text-red-600" onClick={() => confirm(`${kp.name} mit allen WKs löschen?`) && run(() => api.deleteKp(kp.id))}>
              Löschen
            </Button>
          </>
        )}
      </div>
      <div className="divide-y divide-slate-100">
        <PeopleRow
          title="Kommando"
          people={kommando}
          onEdit={onEdit}
          actions={
            me.role === 'BAT' || me.role === 'ADMIN' ? (
              <>
                <Button variant="ghost" className="text-xs" onClick={() => newPerson('KPKDT', null)}>
                  + Kp Kdt
                </Button>
                <Button variant="ghost" className="text-xs" onClick={() => newPerson('LOGOF', null)}>
                  + Log Of
                </Button>
              </>
            ) : (
              canManageUser(me, { role: 'LOGOF', kpId: kp.id, batId: me.batId }) && (
                <Button variant="ghost" className="text-xs" onClick={() => newPerson('LOGOF', null)}>
                  + Log Of
                </Button>
              )
            )
          }
        />
        {zuege.map((z) => {
          const zfhr = kpUsers.filter((u) => u.zugId === z.id && (u.role === 'ZFHR' || u.role === 'LOGOF'));
          const kader = kpUsers.filter((u) => u.zugId === z.id && u.role === 'KADER');
          const unassign = (u: UserRow) => run(() => api.updateUser(u.id, { zugId: null }));
          return (
            <div key={z.id} className="px-3 py-2">
              <div className="mb-1 flex flex-wrap items-center gap-1">
                <span className="font-medium">{z.name}</span>
                <span className="flex-1" />
                {editZuege && (
                  <>
                    <Button variant="ghost" className="!py-0.5 text-xs" onClick={() => setAssign({ zug: z, role: 'ZFHR' })}>
                      + Zugführer
                    </Button>
                    <Button variant="ghost" className="!py-0.5 text-xs" onClick={() => setAssign({ zug: z, role: 'KADER' })}>
                      + Kader
                    </Button>
                    <Button
                      variant="ghost"
                      className="!py-0.5 text-xs"
                      onClick={() => {
                        const name = prompt('Neuer Name', z.name);
                        if (name) run(() => api.updateZug(z.id, { name }));
                      }}
                    >
                      Umbenennen
                    </Button>
                    <Button variant="ghost" className="!py-0.5 text-xs text-red-600" onClick={() => confirm(`${z.name} löschen?`) && run(() => api.deleteZug(z.id))}>
                      Löschen
                    </Button>
                  </>
                )}
              </div>
              <div className="grid gap-1 sm:grid-cols-[7rem,1fr]">
                <span className="text-xs text-slate-500">Zugführer</span>
                <div className="flex flex-wrap gap-1">
                  {zfhr.map((u) => (
                    <Person
                      key={u.id}
                      u={u}
                      main={z.zfhrUserId === u.id}
                      onEdit={canManageUser(me, u) ? () => onEdit(u) : undefined}
                      onRemove={editZuege ? () => unassign(u) : undefined}
                      onMain={editZuege && u.role === 'ZFHR' && z.zfhrUserId !== u.id ? () => run(() => api.updateZug(z.id, { zfhrUserId: u.id })) : undefined}
                    />
                  ))}
                  {zfhr.length === 0 && <span className="text-xs text-amber-700">kein Zugführer</span>}
                </div>
                <span className="text-xs text-slate-500">Kader</span>
                <div className="flex flex-wrap gap-1">
                  {kader.map((u) => (
                    <Person key={u.id} u={u} onEdit={canManageUser(me, u) ? () => onEdit(u) : undefined} onRemove={editZuege ? () => unassign(u) : undefined} />
                  ))}
                  {kader.length === 0 && <span className="text-xs text-slate-400">–</span>}
                </div>
                <span className="text-xs text-slate-500">Gruppen</span>
                <div className="flex flex-wrap items-center gap-1 text-xs">
                  {z.gruppen.map((g) => (
                    <span key={g.id} className="rounded-full bg-slate-500/10 px-2 py-0.5" title={`Soll ${g.soll.kader} Kader · ${g.soll.sdt} Sdt — Ist ${g.ist.kader} · ${g.ist.sdt}`}>
                      <b className="font-medium">{g.name}</b>
                      {g.leiterUserId && ` · ${users.find((u) => u.id === g.leiterUserId)?.name ?? ''}`}
                      <span className="text-slate-500"> · {bestandTotal(g.ist)}/{bestandTotal(g.soll)}</span>
                    </span>
                  ))}
                  {z.gruppen.length === 0 && <span className="text-slate-400">–</span>}
                  {editZuege && (
                    <Button variant="ghost" className="!py-0.5 text-xs" onClick={() => setGruppenOf(z)}>
                      Gruppen bearbeiten
                    </Button>
                  )}
                </div>
                <span className="text-xs text-slate-500">Bestand</span>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <BestandText label="Soll" b={z.soll} />
                  <BestandText label="Ist" b={z.ist} soll={z.soll} />
                  {editZuege && (
                    <Button variant="ghost" className="!py-0.5 text-xs" onClick={() => setBestandOf(z)}>
                      Bestand bearbeiten
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {ohneZug.length > 0 && <PeopleRow title="Ohne Zug" people={ohneZug} onEdit={onEdit} />}
        {editZuege && (
          <div className="px-3 py-2">
            <Button
              variant="ghost"
              className="text-xs"
              onClick={() => {
                const name = prompt('Name des Zuges (z. B. Pi Z 4)');
                if (name) run(() => api.createZug(kp.id, name));
              }}
            >
              + Zug
            </Button>
          </div>
        )}
      </div>
      {gruppenOf && (
        <GruppenDialog
          zug={gruppenOf}
          leaders={kpUsers.filter((u) => u.role === 'KADER' || u.role === 'ZFHR').sort((a, b) => Number(b.zugId === gruppenOf.id) - Number(a.zugId === gruppenOf.id) || a.name.localeCompare(b.name))}
          onSave={(items) => run(() => api.saveGruppen(gruppenOf.id, items)).then(() => setGruppenOf(null))}
          onClose={() => setGruppenOf(null)}
        />
      )}
      {bestandOf && (
        <BestandDialog
          zug={bestandOf}
          onSave={(soll, ist) => run(() => api.updateZug(bestandOf.id, { soll, ist })).then(() => setBestandOf(null))}
          onClose={() => setBestandOf(null)}
        />
      )}
      {assign && assign.zug && (
        <AssignDialog
          kp={kp}
          zug={assign.zug}
          role={assign.role}
          candidates={kpUsers.filter((u) => u.role === assign.role && u.zugId !== assign.zug!.id)}
          onAssign={(u) =>
            run(async () => {
              await api.updateUser(u.id, { zugId: assign.zug!.id });
              if (assign.role === 'ZFHR' && !assign.zug!.zfhrUserId) await api.updateZug(assign.zug!.id, { zfhrUserId: u.id });
              setAssign(null);
            })
          }
          onNew={() => {
            newPerson(assign.role, assign.zug!.id);
            setAssign(null);
          }}
          onClose={() => setAssign(null)}
        />
      )}
    </div>
  );
}

function PeopleRow({ title, people, onEdit, actions }: { title: string; people: UserRow[]; onEdit: (u: UserRow) => void; actions?: ReactNode }) {
  const me = useUser();
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2">
      <span className="w-24 text-xs font-medium text-slate-500">{title}</span>
      <div className="flex flex-1 flex-wrap gap-1">
        {people.map((u) => (
          <Person key={u.id} u={u} onEdit={canManageUser(me, u) ? () => onEdit(u) : undefined} />
        ))}
        {people.length === 0 && <span className="text-xs text-slate-400">–</span>}
      </div>
      {actions}
    </div>
  );
}

/** «Soll 2 / 6 / 30 = 38»; the Ist in amber where it falls short of the Soll. */
function BestandText({ label, b, soll }: { label: string; b: Bestand; soll?: Bestand }) {
  const short = (k: keyof Bestand) => soll && b[k] < soll[k];
  return (
    <span className="tabular-nums" title={BESTAND_KEYS.map((k) => `${BESTAND_LABEL[k]} ${b[k]}`).join(', ')}>
      <span className="text-slate-500">{label} </span>
      {BESTAND_KEYS.map((k, i) => (
        <span key={k}>
          {i > 0 && ' / '}
          <span className={short(k) ? 'font-medium text-amber-700' : ''}>{b[k]}</span>
        </span>
      ))}
      <span className="text-slate-500"> = </span>
      <b>{bestandTotal(b)}</b>
    </span>
  );
}

/** Soll- and Istbestand of a Zug by Zugführer, Kader and Soldaten. */
function BestandDialog({ zug, onSave, onClose }: { zug: Zug; onSave: (soll: Bestand, ist: Bestand) => void; onClose: () => void }) {
  const [soll, setSoll] = useState(zug.soll);
  const [ist, setIst] = useState(zug.ist);
  // With Gruppen, Kader and Soldaten are their sum (edited under «Gruppen bearbeiten»).
  const fromGruppen = zug.gruppen.length > 0;
  const input = (b: Bestand, set: (b: Bestand) => void, k: keyof Bestand, label: string) => (
    <input
      type="number"
      min={0}
      max={999}
      aria-label={`${label} ${BESTAND_LABEL[k]}`}
      className="input w-20 text-center tabular-nums"
      value={b[k]}
      onChange={(e) => set({ ...b, [k]: Math.max(0, Math.min(999, Math.round(Number(e.target.value) || 0))) })}
    />
  );
  return (
    <Modal
      title={`Bestand ${zug.name}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" onClick={() => onSave(soll, ist)}>
            Speichern
          </Button>
        </>
      }
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500">
            <th className="py-1" />
            <th className="py-1 text-center font-medium">Sollbestand</th>
            <th className="py-1 text-center font-medium">Istbestand</th>
          </tr>
        </thead>
        <tbody>
          {BESTAND_KEYS.map((k) => (
            <tr key={k}>
              <td className="py-1 pr-3">{BESTAND_LABEL[k]}</td>
              {fromGruppen && k !== 'zfhr' ? (
                <>
                  <td className="py-1 text-center tabular-nums text-slate-500">{soll[k]}</td>
                  <td className="py-1 text-center tabular-nums text-slate-500">{ist[k]}</td>
                </>
              ) : (
                <>
                  <td className="py-1 text-center">{input(soll, setSoll, k, 'Soll')}</td>
                  <td className="py-1 text-center">{input(ist, setIst, k, 'Ist')}</td>
                </>
              )}
            </tr>
          ))}
          <tr className="border-t font-semibold">
            <td className="py-1 pr-3">Total</td>
            <td className="py-1 text-center tabular-nums">{bestandTotal(soll)}</td>
            <td className="py-1 text-center tabular-nums">{bestandTotal(ist)}</td>
          </tr>
        </tbody>
      </table>
      <p className="text-xs text-slate-500">
        {fromGruppen && 'Kader und Soldaten ergeben sich aus den Gruppen des Zuges. '}
        Erscheint in der Personalplanung jedes WKs und in der Jahresplanung des Bataillons.
      </p>
    </Modal>
  );
}

/** Gruppen of a Zug: name, Gruppenführer and Bestand (Kader, Soldaten); the Zug's Bestand is their sum. */
function GruppenDialog({ zug, leaders, onSave, onClose }: { zug: Zug; leaders: UserRow[]; onSave: (items: GruppeInput[]) => void; onClose: () => void }) {
  const [rows, setRows] = useState<GruppeInput[]>(() =>
    zug.gruppen.length
      ? zug.gruppen.map(({ id, name, leiterUserId, soll, ist }) => ({ id, name, leiterUserId, soll, ist }))
      : [{ name: 'Gruppe 1', leiterUserId: null, soll: { zfhr: 0, kader: 0, sdt: 0 }, ist: { zfhr: 0, kader: 0, sdt: 0 } }],
  );
  const set = (i: number, patch: Partial<GruppeInput>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const num = (i: number, which: 'soll' | 'ist', k: 'kader' | 'sdt', label: string) => (
    <input
      type="number"
      min={0}
      max={999}
      aria-label={label}
      className="input w-14 !px-1 text-center tabular-nums"
      value={rows[i][which][k]}
      onChange={(e) => set(i, { [which]: { ...rows[i][which], [k]: Math.max(0, Math.min(999, Math.round(Number(e.target.value) || 0))) } })}
    />
  );
  const total = (which: 'soll' | 'ist', k: 'kader' | 'sdt') => rows.reduce((a, r) => a + r[which][k], 0);
  const valid = rows.every((r) => r.name.trim());
  return (
    <Modal
      title={`Gruppen ${zug.name}`}
      onClose={onClose}
      wide
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" disabled={!valid} onClick={() => onSave(rows.map((r) => ({ ...r, name: r.name.trim() })))}>
            Speichern
          </Button>
        </>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="py-1 pr-2 font-normal">Gruppe</th>
              <th className="py-1 pr-2 font-normal">Gruppenführer/in</th>
              <th className="py-1 text-center font-normal" colSpan={2}>
                Soll Kader · Sdt
              </th>
              <th className="py-1 text-center font-normal" colSpan={2}>
                Ist Kader · Sdt
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id ?? `neu${i}`}>
                <td className="py-1 pr-2">
                  <input className="input min-w-[7rem]" value={r.name} aria-label="Name der Gruppe" onChange={(e) => set(i, { name: e.target.value })} />
                </td>
                <td className="py-1 pr-2">
                  <select className="input min-w-[9rem]" value={r.leiterUserId ?? ''} aria-label="Gruppenführer/in" onChange={(e) => set(i, { leiterUserId: e.target.value ? Number(e.target.value) : null })}>
                    <option value="">–</option>
                    {leaders.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-1 pr-1">{num(i, 'soll', 'kader', 'Soll Kader')}</td>
                <td className="py-1 pr-3">{num(i, 'soll', 'sdt', 'Soll Soldaten')}</td>
                <td className="py-1 pr-1">{num(i, 'ist', 'kader', 'Ist Kader')}</td>
                <td className="py-1 pr-2">{num(i, 'ist', 'sdt', 'Ist Soldaten')}</td>
                <td className="py-1">
                  <button className="px-1 text-slate-400 hover:text-red-600" aria-label="Gruppe entfernen" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            <tr className="border-t text-xs font-semibold">
              <td className="py-1 pr-2" colSpan={2}>
                Total Zug (ohne Zugführer)
              </td>
              <td className="py-1 text-center tabular-nums">{total('soll', 'kader')}</td>
              <td className="py-1 text-center tabular-nums">{total('soll', 'sdt')}</td>
              <td className="py-1 text-center tabular-nums">{total('ist', 'kader')}</td>
              <td className="py-1 text-center tabular-nums">{total('ist', 'sdt')}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <Button
        variant="ghost"
        className="text-xs"
        onClick={() => setRows([...rows, { name: `Gruppe ${rows.length + 1}`, leiterUserId: null, soll: { zfhr: 0, kader: 0, sdt: 0 }, ist: { zfhr: 0, kader: 0, sdt: 0 } }])}
      >
        + Gruppe
      </Button>
      <p className="text-xs text-slate-500">
        Kader und Soldaten des Zuges ergeben sich aus den Gruppen; der Zugführer-Bestand bleibt beim Zug. Neue WKs übernehmen die Gruppen für Detailplanung und
        Turnus (pro WK anpassbar). In der Jahresplanung hat jede Gruppe eine eigene Zeile.
      </p>
    </Modal>
  );
}

/** A person as a chip: click to edit; optional «main Zugführer» star and removal from the Zug. */
function Person({ u, main, onEdit, onRemove, onMain }: { u: UserRow; main?: boolean; onEdit?: () => void; onRemove?: () => void; onMain?: () => void }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${main ? 'border-zs-orange bg-orange-50' : 'border-slate-200 bg-white'}`}>
      {main && <span title="Haupt-Zugführer/in">★</span>}
      <button className="hover:underline disabled:no-underline" disabled={!onEdit} onClick={onEdit} title={u.email}>
        {u.name}
        <span className="text-slate-500"> · {u.role === 'ZFHR' && !main ? 'Zfhr Stv' : u.funktion || ROLE_LABEL[u.role]}</span>
      </button>
      {onMain && (
        <button className="text-slate-400 hover:text-zs-orange" onClick={onMain} title="Als Haupt-Zugführer/in setzen" aria-label={`${u.name} als Haupt-Zugführer/in`}>
          ☆
        </button>
      )}
      {onRemove && (
        <button className="text-slate-400 hover:text-red-600" onClick={onRemove} title="Aus dem Zug entfernen" aria-label={`${u.name} aus dem Zug entfernen`}>
          ✕
        </button>
      )}
    </span>
  );
}

function AssignDialog({
  kp,
  zug,
  role,
  candidates,
  onAssign,
  onNew,
  onClose,
}: {
  kp: Kompanie;
  zug: Zug;
  role: Role;
  candidates: UserRow[];
  onAssign: (u: UserRow) => void;
  onNew: () => void;
  onClose: () => void;
}) {
  const [pick, setPick] = useState<number | ''>('');
  const label = role === 'ZFHR' ? 'Zugführer/in' : 'Kader';
  return (
    <Modal
      title={`${label} für ${zug.name}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" disabled={!pick} onClick={() => onAssign(candidates.find((c) => c.id === pick)!)}>
            Zuteilen
          </Button>
        </>
      }
    >
      <Field label={`Bestehende Person aus ${kp.name}`}>
        <select className="input" value={pick} onChange={(e) => setPick(e.target.value ? Number(e.target.value) : '')}>
          <option value="">– wählen –</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.zugId ? ' (wechselt den Zug)' : ' (ohne Zug)'}
            </option>
          ))}
        </select>
      </Field>
      {candidates.length === 0 && <p className="text-sm text-slate-500">Keine weiteren Personen mit dieser Rolle in der Kompanie.</p>}
      <div className="border-t pt-3">
        <Button onClick={onNew}>+ Neue Person erfassen</Button>
      </div>
    </Modal>
  );
}
