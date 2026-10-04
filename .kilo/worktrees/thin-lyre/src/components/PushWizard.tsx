import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Check, ExternalLink, FolderOpen, Loader2, Plus, Rocket, X } from "lucide-react";
import { toast } from "sonner";
import { createRepo, listBranches, pushFiles } from "@/lib/github.functions";
import { useGithubOverview, useSettings } from "@/lib/github-hooks";

const IGNORED = /(^|\/)(node_modules|\.git|dist|build|\.next|\.cache|\.DS_Store)(\/|$)/;
const MAX_TOTAL = 8 * 1024 * 1024;
const steps = ["Folder", "Repository", "Commit", "Push"];

async function toBase64(file: File) {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

const Ctx = createContext<{ open: (repo?: string) => void }>({ open: () => {} });
export const usePushWizard = () => useContext(Ctx);

export function PushWizardProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; repo?: string | undefined }>({ open: false });
  return (
    <Ctx.Provider value={{ open: (repo) => setState({ open: true, repo }) }}>
      {children}
      {state.open && <Wizard initialRepo={state.repo} onClose={() => setState({ open: false })} />}
    </Ctx.Provider>
  );
}

type Picked = { path: string; file: File };

function Wizard({ initialRepo, onClose }: { initialRepo?: string | undefined; onClose: () => void }) {
  const overview = useGithubOverview();
  const settings = useSettings();
  const qc = useQueryClient();
  const branchesFn = useServerFn(listBranches);
  const createFn = useServerFn(createRepo);
  const pushFn = useServerFn(pushFiles);
  const inputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(0);
  const [folder, setFolder] = useState<string | null>(null);
  const [files, setFiles] = useState<Picked[]>([]);
  const [repo, setRepo] = useState<string | null>(initialRepo ?? null);
  const [branch, setBranch] = useState("");
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState(0);
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; count: number } | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPrivate, setNewPrivate] = useState(true);
  const [busyCreate, setBusyCreate] = useState(false);

  useEffect(() => {
    inputRef.current?.setAttribute("webkitdirectory", "");
  }, [step]);

  const repoInfo = overview.data?.repos.find((r) => r.fullName === repo);
  const branches = useQuery({
    queryKey: ["gh", "branches", repo],
    enabled: !!repo,
    queryFn: () => branchesFn({ data: { repo: repo! } }),
  });

  useEffect(() => {
    if (!repo || !branches.data) return;
    const pref = settings.data?.default_branch;
    const list = branches.data;
    const fallback = repoInfo?.defaultBranch ?? "main";
    setBranch(pref && list.includes(pref) ? pref : list.includes(fallback) ? fallback : (list[0] ?? fallback));
  }, [repo, branches.data, settings.data, repoInfo]);

  const total = files.reduce((n, f) => n + f.file.size, 0);
  const tooBig = total > MAX_TOTAL || files.length > 1000;

  const onPick = (list: FileList | null) => {
    if (!list?.length) return;
    const picked: Picked[] = [];
    let root = "";
    for (const file of Array.from(list)) {
      const rel = (file as File & { webkitRelativePath: string }).webkitRelativePath || file.name;
      const parts = rel.split("/");
      if (parts.length > 1) root = parts[0] ?? root;
      const path = parts.length > 1 ? parts.slice(1).join("/") : rel;
      if (!IGNORED.test(path)) picked.push({ path, file });
    }
    setFolder(root || "Selected folder");
    setFiles(picked);
  };

  const doCreate = async () => {
    setBusyCreate(true);
    try {
      const r = await createFn({ data: { name: newName.trim(), private: newPrivate } });
      await qc.invalidateQueries({ queryKey: ["gh", "overview"] });
      setRepo(r.fullName);
      setCreating(false);
      setNewName("");
      toast.success(`Created ${r.fullName}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create repo");
    } finally {
      setBusyCreate(false);
    }
  };

  const doPush = async () => {
    if (!repo || !branch) return;
    setStep(3);
    setPushing(true);
    setError(null);
    setProgress(5);
    try {
      const payload: { path: string; content: string }[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i]!;
        payload.push({ path: f.path, content: await toBase64(f.file) });
        setProgress(5 + Math.round(((i + 1) / files.length) * 45));
      }
      setProgress(60);
      const r = await pushFn({ data: { repo, branch, message, files: payload } });
      setProgress(100);
      setResult({ url: r.url, count: r.count });
      toast.success("Pushed to GitHub 🎉");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPushing(false);
      qc.invalidateQueries({ queryKey: ["history"] });
      qc.invalidateQueries({ queryKey: ["gh", "overview"] });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-6">
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-card p-6 shadow-2xl sm:rounded-3xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">Push your project</h2>
          <button onClick={() => !pushing && onClose()} className="rounded-full p-2 hover:bg-muted" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mb-6 flex gap-2">
          {steps.map((s, i) => (
            <div key={s} className="flex-1">
              <div className={`h-1.5 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} />
              <p className={`mt-1 text-xs ${i === step ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{s}</p>
            </div>
          ))}
        </div>

        {step === 0 && (
          <div className="space-y-4">
            <label className="flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border bg-muted/50 p-8 text-center hover:border-primary">
              <FolderOpen className="h-10 w-10 text-primary" />
              <span className="font-semibold">{folder ?? "Choose a folder from your computer"}</span>
              <span className="text-sm text-muted-foreground">
                {files.length ? `${files.length} files · ${(total / 1024).toFixed(0)} KB` : "node_modules, .git and build folders are skipped"}
              </span>
              <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => onPick(e.target.files)} />
            </label>
            {tooBig && <p className="text-sm text-destructive">Too large — max 1000 files and 8 MB per push.</p>}
            <button disabled={!files.length || tooBig} onClick={() => setStep(1)} className="btn-primary w-full">Next</button>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            {creating ? (
              <div className="space-y-3 rounded-2xl bg-secondary p-4">
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="new-repo-name" className="field" />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={newPrivate} onChange={(e) => setNewPrivate(e.target.checked)} /> Private
                </label>
                <div className="flex gap-2">
                  <button onClick={() => setCreating(false)} className="btn-ghost flex-1">Cancel</button>
                  <button disabled={!newName.trim() || busyCreate} onClick={doCreate} className="btn-primary flex-1">
                    {busyCreate ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setCreating(true)} className="btn-ghost w-full"><Plus className="h-4 w-4" /> Create new repo</button>
            )}
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {overview.isLoading && <Loader2 className="mx-auto h-5 w-5 animate-spin" />}
              {overview.data?.repos.map((r) => (
                <button
                  key={r.fullName}
                  onClick={() => setRepo(r.fullName)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm ${repo === r.fullName ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                >
                  <span className="truncate font-medium">{r.fullName}</span>
                  {r.private && <span className="text-xs opacity-70">private</span>}
                </button>
              ))}
            </div>
            {repo && (
              <div>
                <p className="mb-1 text-sm font-semibold">Branch</p>
                {branches.isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : branches.data && branches.data.length > 0 ? (
                  <select value={branch} onChange={(e) => setBranch(e.target.value)} className="field">
                    {branches.data.map((b) => <option key={b}>{b}</option>)}
                  </select>
                ) : (
                  <p className="text-sm text-muted-foreground">Empty repo — will push to <b>{branch}</b>.</p>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setStep(0)} className="btn-ghost flex-1">Back</button>
              <button disabled={!repo || !branch} onClick={() => setStep(2)} className="btn-primary flex-1">Next</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{files.length} files → <b>{repo}</b> on <b>{branch}</b></p>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="What did you change?" className="field" />
            <div className="flex gap-2">
              <button onClick={() => setStep(1)} className="btn-ghost flex-1">Back</button>
              <button disabled={!message.trim()} onClick={doPush} className="btn-primary flex-1"><Rocket className="h-4 w-4" /> Push</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 text-center">
            {result ? (
              <>
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-mint"><Check className="h-8 w-8 text-mint-foreground" /></div>
                <p className="font-display text-lg font-bold">Pushed {result.count} files!</p>
                <a href={result.url} target="_blank" rel="noreferrer" className="btn-primary w-full">View commit <ExternalLink className="h-4 w-4" /></a>
                <button onClick={onClose} className="btn-ghost w-full">Done</button>
              </>
            ) : error ? (
              <>
                <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
                <p className="text-sm text-destructive">{error}</p>
                <button onClick={() => setStep(2)} className="btn-ghost w-full">Try again</button>
              </>
            ) : (
              <>
                <p className="font-semibold">{pushing ? "Pushing…" : "Ready"}</p>
                <div className="h-3 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-tangerine transition-all" style={{ width: `${progress}%` }} />
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
