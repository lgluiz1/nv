import sys
from PIL import Image
import os

source_image = r"C:\Users\Micro\Downloads\ChatGPT Image 8 de jun. de 2026, 17_24_46.png"

if not os.path.exists(source_image):
    print("Imagem fonte não encontrada em: " + source_image)
    sys.exit(1)

out_dir_prod = r"C:\Users\Micro\Desktop\nv\nv\quicktrack_producao_repo\backend\static\images"
out_dir_dev = r"C:\Users\Micro\Desktop\nv\nv\static\images"

os.makedirs(out_dir_prod, exist_ok=True)
os.makedirs(out_dir_dev, exist_ok=True)

out_160_prod = os.path.join(out_dir_prod, "icon-sac-160x160.png")
out_512_prod = os.path.join(out_dir_prod, "icon-sac-512x512.png")

out_160_dev = os.path.join(out_dir_dev, "icon-sac-160x160.png")
out_512_dev = os.path.join(out_dir_dev, "icon-sac-512x512.png")

try:
    with Image.open(source_image) as img:
        img_160 = img.resize((160, 160), Image.Resampling.LANCZOS)
        img_160.save(out_160_prod)
        img_160.save(out_160_dev)
        print(f"Salvou os icones de 160x160!")
        
        img_512 = img.resize((512, 512), Image.Resampling.LANCZOS)
        img_512.save(out_512_prod)
        img_512.save(out_512_dev)
        print(f"Salvou os icones de 512x512!")
except Exception as e:
    print(f"Erro ao redimensionar: {e}")
