#!/bin/sh
# Private deployment image only. No provider secrets enter the image build.
set -eu
python3 -m venv /opt/doodlume-runtime
runtime_python=/opt/doodlume-runtime/bin/python
"$runtime_python" -m pip install --no-cache-dir 'pip==25.0.1' 'setuptools==75.8.0' 'wheel==0.45.1'
"$runtime_python" -m pip install --no-cache-dir 'torch==2.5.1+cpu' 'torchvision==0.20.1+cpu' --extra-index-url https://download.pytorch.org/whl/cpu
"$runtime_python" -m pip install --no-cache-dir 'numpy==1.26.4' 'Pillow==11.1.0' 'opencv-python-headless==4.10.0.84' 'hydra-core==1.3.2' 'omegaconf==2.3.0' 'iopath==0.1.10' 'tqdm==4.67.1'
SAM2_BUILD_CUDA=0 "$runtime_python" -m pip install --no-cache-dir --no-build-isolation --no-deps 'git+https://github.com/facebookresearch/sam2.git@2b90b9f5ceec907a1c18123530e92e794ad901a4'
mkdir -p /opt/doodlume-models
curl --fail --location --retry 2 --max-time 300 -o /opt/doodlume-models/sam2.1_hiera_tiny.pt https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_tiny.pt
echo '7402e0d864fa82708a20fbd15bc84245c2f26dff0eb43a4b5b93452deb34be69  /opt/doodlume-models/sam2.1_hiera_tiny.pt' | sha256sum --check
curl --fail --location --retry 2 --max-time 300 -o /opt/doodlume-models/big-lama.pt https://github.com/Sanster/models/releases/download/add_big_lama/big-lama.pt
echo 'e3aa4aaa15225a33ec84f9f4bc47e500  /opt/doodlume-models/big-lama.pt' | md5sum --check
"$runtime_python" - <<'PY'
import torch, cv2
from sam2.build_sam import build_sam2
build_sam2('configs/sam2.1/sam2.1_hiera_t.yaml','/opt/doodlume-models/sam2.1_hiera_tiny.pt',device='cpu',apply_postprocessing=False)
torch.jit.load('/opt/doodlume-models/big-lama.pt',map_location='cpu').eval()
print('CPU image-processing models load successfully.')
PY
