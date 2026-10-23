"""
Makes the two darker copies of the logo used by the turning 3D logo on the dashboard Overview page.

  python3 make_tones.py

Run it again whenever you replace src/assets/images/cinemor-logo.png, so the shaded sides match the new logo.
Needs: python3 and Pillow (pip install pillow).
"""
import os
from PIL import Image, ImageEnhance

IMAGES = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'src', 'assets', 'images')
logo = Image.open(os.path.join(IMAGES, 'cinemor-logo.png')).convert('RGBA')


def tone(image, brightness, saturation, size):
    r, g, b, a = image.split()
    rgb = Image.merge('RGB', (r, g, b))
    rgb = ImageEnhance.Brightness(ImageEnhance.Color(rgb).enhance(saturation)).enhance(brightness)
    out = rgb.convert('RGBA')
    out.putalpha(a)  # keep the original shape
    return out.resize((size, size), Image.LANCZOS)


tone(logo, 0.78, 1.3, 384).save(os.path.join(IMAGES, 'cinemor-logo-3d-mid.png'), optimize=True)
tone(logo, 0.52, 1.5, 384).save(os.path.join(IMAGES, 'cinemor-logo-3d-dark.png'), optimize=True)
print('done: cinemor-logo-3d-mid.png and cinemor-logo-3d-dark.png')
