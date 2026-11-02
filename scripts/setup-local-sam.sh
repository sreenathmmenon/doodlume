#!/bin/sh
# Installs the optional local Meta SAM 2.1 worker outside the Git repository.
set -eu
sam_runtime="${DOODLUME_SAM_RUNTIME:-$HOME/.cache/doodlume-sam-runtime}"
sam_python="${DOODLUME_PYTHON:-python3.11}"
"$sam_python" -c 'import sys; assert sys.version_info >= (3,10), "Local SAM requires Python 3.10 or newer"'
"$sam_python" -m venv --system-site-packages "$sam_runtime"
"$sam_runtime/bin/python" -m pip install --disable-pip-version-check 'torch==2.11.0' 'torchvision==0.26.0' 'hydra-core==1.3.8' 'omegaconf==2.3.0' 'antlr4-python3-runtime==4.9.3' 'iopath==0.1.10' 'Pillow>=10.4,<13' 'numpy>=1.24,<3'
SAM2_BUILD_CUDA=0 "$sam_runtime/bin/python" -m pip install --disable-pip-version-check --no-build-isolation --no-deps 'git+https://github.com/facebookresearch/sam2.git@2b90b9f5ceec907a1c18123530e92e794ad901a4'
mkdir -p "$sam_runtime/models"
if [ ! -f "$sam_runtime/models/sam2.1_hiera_tiny.pt" ]; then
  curl --fail --location --max-time 300 --output "$sam_runtime/models/sam2.1_hiera_tiny.pt.download" https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_tiny.pt
  mv "$sam_runtime/models/sam2.1_hiera_tiny.pt.download" "$sam_runtime/models/sam2.1_hiera_tiny.pt"
fi
"$sam_runtime/bin/python" -c 'import torch; from sam2.build_sam import build_sam2; print("Local Meta SAM 2.1 installed; accelerator:", "MPS" if torch.backends.mps.is_available() else "CPU")'
printf '%s\n' 'Set CUTOUT_PROVIDER=local-sam2 in the ignored .env.local file to enable local cutouts.'
