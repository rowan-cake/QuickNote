import {Plugin, TFile, Notice, requestUrl,FileSystemAdapter,normalizePath, Platform  } from 'obsidian';
import { spawnSync,spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';


// Main plugin class. 
export default class QuickNotePlugin extends Plugin {
  private serverProc: ChildProcessWithoutNullStreams | null = null; // Global varrible so we can kill server on unload


  // REQUIRES: Nothing
  // MODIFIES: The newest note created
  // EFFECTS : Checks python dependencies, Starts local python server, Listens for a newly created note and then inserts a auto summary into it by calling ".handleNewNote()"
  async onload() {
    await this.ensurePythonDependencies();
    await this.startPythonServer(); //start up the flask server (has the ollama call in it)
    console.log("QuickNote Loaded")  
    this.app.workspace.onLayoutReady(() => {
      this.registerEvent( // Listen for newly created files in the vault
        this.app.vault.on("create", async (file) => { //on creation of a new TEXT file only
          if (!(file instanceof TFile) || file.extension !== "md") return; //NOTE TFile is just a wrapper around a .md file so both checks might be unessacry
            await this.handleNewNote(file); // logic for the insertion into the new note
          })
      );
    });
  }


  // REQUIRES: Nothing
  // MODIFIES: Server procces
  // EFFECTS : Kills the local server
  onunload() {
    if (this.serverProc) { // Kill the server when plugin is disabled or reloaded
      this.serverProc.kill();    
    } 
  }

  // REQUIRES: Nothing
  // MODIFIES: Nothing
  // EFFECTS : Made to resolve the users path to their python(or python3) command. 
  private resolvePythonPath(): string {
    const locator = Platform.isWin ? 'where' : 'which'; //Fixed to use "Platform"
    for (const name of ['python3', 'python']) { // First try 'python3', then fallback to 'python'
      const result = spawnSync(locator, [name], { encoding: 'utf8' });
      if (result.status == 0) {
        const fullPath = normalizePath(result.stdout); //normalizePath for cross platform use
        if (fs.existsSync(fullPath)) {
          return fullPath;
        }
      }
    }
    // Last-ditch: assume 'python3' on PATH
    return 'python3';
  }


  // REQUIRES: Nothing
  // MODIFIES: Nothing
  // EFFECTS : Make's sure that all the nessacary python imports are present (by calling .checkPythonImports())
  private async ensurePythonDependencies(): Promise<void> {
    const vaultAdapter = this.app.vault.adapter;
    if(!(vaultAdapter instanceof FileSystemAdapter)){ // instaceof Check
      new Notice('QuickNote: Cannot determine vault path');
      return
    }
    const vaultRoot = vaultAdapter.getBasePath();
    const pluginDir = path.join(vaultRoot, this.app.vault.configDir, 'plugins', this.manifest.id);
    const py        = this.resolvePythonPath();
    let ok: boolean;
    try {
      ok = await this.checkPythonImports(py, pluginDir);
    } catch (e) {
      new Notice('QuickNote: couldn’t verify Python dependencies (flask, ollama)');
      return;
    }
    // Notify user if imports aren’t present
    if (ok) {
    } else {
      console.log(ok)
      new Notice('QuickNote: Missing Python dependencies (flask, ollama)');
    }
  }


  // REQUIRES: "pyCmd" is a proper python path
  // MODIFIES: Nothing
  // EFFECTS : Returns true if flask and ollama are installed on user's machine.
  private async checkPythonImports(pyCmd: string, cwd: string): Promise<boolean> {
    try {
      // Spawn a short-lived Python process to test the imports
      const code = await new Promise<number>((resolve, reject) => {
      const tester = spawn(pyCmd, ['-c', 'import flask, ollama'], { cwd });
      tester.once('error', reject);
      tester.once('close', (c) => resolve(c ?? 1)); // treat null as failure
      });
      // code === 0 means both imports succeeded
      return code === 0;
    }
    catch (e) {
      if(e.code == 'ENOENT')
        return true; // suppres the error is because MAC doesnt have acceses to all the python imports on your sysytem
      else
        return false;

    } 
  }
  

  // REQUIRES: Python imports to be resolved.
  // MODIFIES: Nothing
  // EFFECTS : Starts the local flask python server. 
  private startPythonServer(): Promise<void> {
    const vaultRoot = (this.app.vault.adapter as FileSystemAdapter).getBasePath(); // path to vault
    const pluginDir = path.join(
      vaultRoot,
      this.app.vault.configDir,  // ".obsidian" config and packages directory
      "plugins",
      this.manifest.name //QuickNote
    );
    const serverPath = path.join(pluginDir, "backend_py", "server.py");
    const pythonCmd = this.resolvePythonPath(); // Get the path to python.exe
    
    // Quick sanity check
    if (!require('fs').existsSync(serverPath)) {
     return Promise.reject(new Error(`server.py not found at ${serverPath}`));
   }

    return new Promise((resolve, reject) => {
    this.serverProc = spawn(pythonCmd, [serverPath], { cwd: pluginDir });

    // If spawning fails outright
    this.serverProc.on('error', (err) => reject(err));

    // Watch stdout — as soon as we see either key banner line, resolve
    this.serverProc.stdout.on('data', (chunk) => {
      const line = chunk.toString().trim();
      
      // resolve on either of these marks of "server up"
      if (
        line.includes('Serving Flask app') ||
        line.includes('Running on')
      ) {
        resolve();
      }
    });
    // If the process dies first, reject
    this.serverProc.on('close', (code) => {
      reject(new Error(`Flask exited early with code ${code}`));
    });
   });
  }

  
  // REQUIRES: "File" is named something that can be interpeted as a keyword, nothing else already running on "127.0.0.1:5000"
  // MODIFIES: "File"
  // EFFECTS : Make a request to the python local server asking for summary, then insert that summary into the "File"
  async handleNewNote(file: TFile) {
    const keyword = file.basename; // Use the note's filename (without extension) as the summary topic
    
    if(keyword.contains("Untitled")){ //dont make a summary in this case
      return
    }

    try {      
      // Use Obsidian’s requestUrl() here instead of fetch() , (use the local host of IPv4)
      const url = `http://127.0.0.1:5000/generate_summary?keyword=${encodeURIComponent(keyword)}&model=default`; // 2. Pass the `keyword` and `model` to the server.py file 
      const response = await requestUrl({ url, method: 'GET' }); 
      // Check HTTP status
      if (response.status !== 200) { //if they are different types or different values it will return true and therefore throw the error.
        throw new Error(`Server returned ${response.status}`);
      }
      // Retrive the data.
      const data = response.json as { summary: string }; //Flask's `jsonify()` on the backend turns the summary into a JSON object.
      const summary = data.summary; //pull out the `summary` field from the json object.      
      const snippet = `- ==Def== :${summary} \n ---\n`; // heres the new text to be inserted
      await this.app.vault.process(file, (data) => {return snippet;}); // fills the file with the new text(in the backround as specifeid in the docs)
      new Notice("QuickNote: summary inserted!!!");
    } catch (e) {
      new Notice("QuickNote: failed to insert summary.");
    }
  } 
}

