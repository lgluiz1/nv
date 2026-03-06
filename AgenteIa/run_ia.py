import sys
import os
import cv2
import numpy as np

def run_ml(img_path, watermark_text=""):
    print("CHECKPOINT: Iniciando importacoes...", flush=True)
    import cv2
    import numpy as np
    from ultralytics import YOLO
    
    print("CHECKPOINT: YOLO Importado.", flush=True)
    import torch
    
    # Configuracao de seguranca
    torch.set_num_threads(1)
    
    # Configura diretorios
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    model_path = os.path.join(BASE_DIR, 'AgenteIa', 'models_bin', 'best.pt')
    
    # Carrega modelos
    model_yolo = YOLO(model_path)
    
    # Carrega imagem
    img_original = cv2.imread(img_path)
    if img_original is None:
        print("FALHA: Nao abriu", flush=True)
        return
        
    # YOLO Detecta (Confianca minima relaxada para 50% devido a variacao de luminosidade/camera)
    results = model_yolo.predict(source=img_original, conf=0.5, verbose=False)
    result = results[0]
    
    found_canhoto = False
    for box in result.boxes:
        if int(box.cls[0]) == 0:  
            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
            h_img, w_img = img_original.shape[:2]
            
            box_w = x2 - x1
            box_h = y2 - y1
            
            # --- TRAVA RELAXADA CONTRA FALSOS POSITIVOS (RECIBOS/TAGS) ---
            # 1. O canhoto nao pode ser um "pontinho" na tela (menos de 3% da area total)
            # 2. O canhoto nao pode ser absurdamente quadrado (aspect_ratio muito proximo de 1.0)
            area_img = w_img * h_img
            area_box = box_w * box_h
            
            if area_box < (area_img * 0.03):
                print(f"CHECKPOINT: Falso Positivo descartado (Area muito pequena: {area_box/area_img*100:.1f}%)", flush=True)
                continue
                
            aspect_ratio = max(box_w, box_h) / min(box_w, box_h)
            if aspect_ratio < 1.2:
                print(f"CHECKPOINT: Falso Positivo descartado (Formato muito quadrado/tag: {aspect_ratio:.2f})", flush=True)
                continue
                
            # Margem de Segurança 15%
            m_w, m_h = int(box_w * 0.15), int(box_h * 0.15)
            nx1, ny1 = max(0, x1 - m_w), max(0, y1 - m_h)
            nx2, ny2 = min(w_img, x2 + m_w), min(h_img, y2 + m_h)

            crop_img = img_original[ny1:ny2, nx1:nx2]
            
            # --- Ajuste OSD de Orientacao com Tesseract OCR ---
            # Aqui conferimos se a foto foi tirada de ponta cabeca (180 deg)
            import pytesseract
            try:
                # OSD (Orientation and Script Detection) retorna os dados do angulo de rotacao necessario
                osd = pytesseract.image_to_osd(crop_img)
                angle_str = ""
                for line in osd.split('\n'):
                    if 'Rotate: ' in line:
                        angle_str = line.split(': ')[1].strip()
                        break
                        
                if angle_str == '90':
                    crop_img = cv2.rotate(crop_img, cv2.ROTATE_90_CLOCKWISE)
                elif angle_str == '180':
                    crop_img = cv2.rotate(crop_img, cv2.ROTATE_180)
                elif angle_str == '270':
                    crop_img = cv2.rotate(crop_img, cv2.ROTATE_90_COUNTERCLOCKWISE)
            except Exception as e:
                # Se bater algum Warning/Error do Tesseract, ignoramos silenciosamente e mantemos a foto reta normal
                pass
            
            # --- Adiciona Tarja Preta (Watermark) ---
            if watermark_text:
                h_crop, w_crop = crop_img.shape[:2]
                font = cv2.FONT_HERSHEY_SIMPLEX
                
                # Ajusta tamanho da fonte dinamicamente e calcula altura da barra
                # Queremos que o texto ocupe no maximo a largura da imagem - 40px margem
                text_scale = 1.0
                text_size = cv2.getTextSize(watermark_text, font, text_scale, 1)[0]
                
                # Se o texto for maior que a tela, diminui a escala
                if text_size[0] > (w_crop - 40):
                    text_scale = (w_crop - 40) / text_size[0]
                
                # Limite minimo de fonte
                text_scale = max(0.4, text_scale)
                
                # Pegar o height correto da fonte
                text_size = cv2.getTextSize(watermark_text, font, text_scale, max(1, int(text_scale*2)))[0]
                
                # Altura da tarja tem margem top/bottom de 15px
                bar_height = text_size[1] + 30
                black_bar = np.zeros((bar_height, w_crop, 3), dtype=np.uint8)
                
                # Cor amarelo vibrante (BGR: 0, 255, 255)
                text_color = (0, 255, 255)
                text_x = 20
                text_y = bar_height - 15  # baseline do texto
                
                cv2.putText(black_bar, watermark_text, (text_x, text_y), font, text_scale, text_color, max(1, int(text_scale*2)), cv2.LINE_AA)
                
                # Junta verticalmente (crop em cima, tarja embaixo)
                crop_img = cv2.vconcat([crop_img, black_bar])

            # Salva o resultado
            print("CHECKPOINT: Salvando imagem cortada...", flush=True)
            crop_path = img_path.replace(".jpg", "_crop.jpg")
            cv2.imwrite(crop_path, crop_img, [cv2.IMWRITE_JPEG_QUALITY, 90])
            print(f"SUCESSO:{crop_path}", flush=True)
            return
            
    print("FALHA:Nao encontrou canhoto", flush=True)

if __name__ == "__main__":
    import sys
    # Forcar UTF-8 pra print no subprocesso Windows/Linux
    sys.stdout.reconfigure(encoding='utf-8')
    if len(sys.argv) > 1:
        img_p = sys.argv[1]
        wm_text = sys.argv[2] if len(sys.argv) > 2 else ""
        run_ml(img_p, wm_text)
