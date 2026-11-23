# GTW sandbox + LibreOffice: headless Office->PDF export, slide rendering,
# legacy .doc/.ppt/.xls conversion. Base image unchanged otherwise.
#
# Build:  docker build -t hermes-sandbox-office:latest -f sandbox-office.Dockerfile .
# Enable: hermes config set terminal.docker_image hermes-sandbox-office:latest
#         (also terminal.modal_image / terminal.daytona_image if those backends are used)
#
# /root is a host bind mount (sandboxes/docker/<profile>/home), so recreating a
# container with this image preserves user files. Adds ~writer/calc/impress +
# poppler (pdftoppm/pdftocairo) + Liberation/DejaVu fonts for faithful rendering.
FROM nousresearch/hermes-sandbox:desktop
USER root
RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-writer libreoffice-calc libreoffice-impress \
      poppler-utils fonts-liberation fonts-dejavu-core \
    && apt-get clean && rm -rf /var/lib/apt/lists/*