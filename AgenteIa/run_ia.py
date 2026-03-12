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
    
    valid_crops = []
    
    # Percorre todas as detecções para encontrar canhotos (Classe 0)
    for box in result.boxes:
        if int(box.cls[0]) == 0:  
            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
            h_img, w_img = img_original.shape[:2]
            
            box_w = x2 - x1
            box_h = y2 - y1
            
            # --- FILTROS DE SEGURANÇA ---
            area_img = w_img * h_img
            area_box = box_w * box_h
            
            # 1. O canhoto nao pode ser um "pontinho" na tela (menos de 3% da area total)
            if area_box < (area_img * 0.03):
                continue
                
            # 2. O canhoto nao pode ser absurdamente quadrado (aspect_ratio muito proximo de 1.0)
            aspect_ratio = max(box_w, box_h) / min(box_w, box_h)
            if aspect_ratio < 1.2:
                continue
                
            # Margem de Segurança 15%
            m_w, m_h = int(box_w * 0.15), int(box_h * 0.15)
            nx1, ny1 = max(0, x1 - m_w), max(0, y1 - m_h)
            nx2, ny2 = min(w_img, x2 + m_w), min(h_img, y2 + m_h)

            crop_img = img_original[ny1:ny2, nx1:nx2]
            
            # --- Ajuste OSD de Orientacao com Tesseract OCR ---
            import pytesseract
            try:
                osd = pytesseract.image_to_osd(crop_img)
                angle = 0
                for line in osd.split('\n'):
                    if 'Rotate: ' in line:
                        angle = int(line.split(': ')[1].strip())
                        break
                        
                if angle == 90:
                    crop_img = cv2.rotate(crop_img, cv2.ROTATE_90_CLOCKWISE)
                elif angle == 180:
                    crop_img = cv2.rotate(crop_img, cv2.ROTATE_180)
                elif angle == 270:
                    crop_img = cv2.rotate(crop_img, cv2.ROTATE_90_COUNTERCLOCKWISE)
            except:
                pass
            
            valid_crops.append(crop_img)

    # Se encontramos pelo menos um canhoto válido
    if valid_crops:
        # --- Lógica de Junção (Merge) ---
        # 1. Padronizamos a largura de todos os recortes pela largura do maior recorte encontrado
        max_w = max(crop.shape[1] for crop in valid_crops)
        
        resized_crops = []
        for crop in valid_crops:
            h, w = crop.shape[:2]
            if w != max_w:
                new_h = int(h * (max_w / w))
                crop = cv2.resize(crop, (max_w, new_h), interpolation=cv2.INTER_LANCZOS4)
            resized_crops.append(crop)
            
        # 2. Concatena verticalmente todos os canhotos
        final_img = cv2.vconcat(resized_crops) if len(resized_crops) > 1 else resized_crops[0]

        # --- Adiciona Tarja Preta (Watermark) Única no final ---
        if watermark_text:
            h_final, w_final = final_img.shape[:2]
            font = cv2.FONT_HERSHEY_SIMPLEX
            
            text_scale = 1.0
            text_size = cv2.getTextSize(watermark_text, font, text_scale, 1)[0]
            if text_size[0] > (w_final - 40):
                text_scale = (w_final - 40) / text_size[0]
            
            text_scale = max(0.4, text_scale)
            thickness = max(1, int(text_scale * 2))
            text_size = cv2.getTextSize(watermark_text, font, text_scale, thickness)[0]
            
            bar_height = text_size[1] + 30
            black_bar = np.zeros((bar_height, w_final, 3), dtype=np.uint8)
            
            text_color = (0, 255, 255) # Amarelo
            cv2.putText(black_bar, watermark_text, (20, bar_height - 15), font, text_scale, text_color, thickness, cv2.LINE_AA)
            
            final_img = cv2.vconcat([final_img, black_bar])

        # Salva o resultado final
        crop_path = img_path.replace(".jpg", "_crop.jpg")
        cv2.imwrite(crop_path, final_img, [cv2.IMWRITE_JPEG_QUALITY, 90])
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
