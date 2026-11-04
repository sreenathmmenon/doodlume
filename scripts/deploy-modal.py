"""Deploy the complete studio with CPU memory for SAM and background repair.

Only FIREWORKS_API_KEY is passed as a runtime Secret. The Docker allowlist
excludes credentials and local artifacts; no secret is provided to image builds.
"""
from pathlib import Path
import os
import modal

ROOT = Path(__file__).resolve().parents[1]
image = (modal.Image.from_dockerfile(ROOT / 'Dockerfile', context_dir=ROOT, add_python='3.11')
         if modal.is_local() else modal.Image.debian_slim())
runtime_secret = modal.Secret.from_dict({'FIREWORKS_API_KEY': os.environ['FIREWORKS_API_KEY']}
                                      if modal.is_local() else {})
app = modal.App('doodlume-studio')

@app.function(image=image, cpu=4, memory=(4096,8192), timeout=180,
              max_containers=1, scaledown_window=600,
              secrets=[runtime_secret])
@modal.concurrent(max_inputs=32)
@modal.web_server(8080, startup_timeout=60, label='doodlume')
def web():
    import subprocess
    env = dict(os.environ, PORT='8080', NODE_ENV='production',
               PUBLIC_ORIGIN=web.get_web_url().rstrip('/'), MODEL_PROVIDER='fireworks',
               MAX_MODEL_REQUESTS='20', CUTOUT_PROVIDER='local-sam2',
               LOCAL_SAM_PYTHON='/opt/doodlume-runtime/bin/python',
               LOCAL_SAM_CHECKPOINT='/opt/doodlume-models/sam2.1_hiera_tiny.pt',
               LOCAL_LAMA_CHECKPOINT='/opt/doodlume-models/big-lama.pt')
    # Preserve the container's unprivileged application user even when the
    # hosting runtime itself launches its Python entrypoint as root.
    identity = {'user':'node','group':'node'} if os.getuid() == 0 else {}
    subprocess.Popen(['node','--import','tsx','server/index.ts'],cwd='/app',env=env,**identity)
