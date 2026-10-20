"""Open this file in Blender's Text Editor and choose Run Script.

Imports the authored Fembot GLB, retains its 17 host-joint pivots, creates a
studio setup, saves assets/fembot/Fembot.blend, and renders Fembot-preview.png.
No add-ons, downloads, credentials or network access are required.
"""
from pathlib import Path
import math
import bpy
from mathutils import Vector

# Works both with Blender --python and Text Editor > Open > Run Script.
ROOT = Path(__file__).resolve().parents[1]
ASSET = ROOT / 'public' / 'characters' / 'fembot' / 'fembot.glb'
OUTPUT = ROOT / 'assets' / 'fembot'
OUTPUT.mkdir(parents=True, exist_ok=True)
if not ASSET.is_file():
    raise FileNotFoundError('Generate fembot.glb with assets/fembot/build_geometry.py first.')

# Create a new scene; preserve any other open scene instead of clearing the file.
scene = bpy.data.scenes.new('Fembot - studio')
if bpy.context.window:
    bpy.context.window.scene = scene
bpy.ops.import_scene.gltf(filepath=str(ASSET))
# The shipped GLB root is still named AIXiin. A rebuild names it Fembot.
model = next(o for o in scene.objects if o.name.startswith('Fembot') or o.name.startswith('AIXiin'))
model.scale = (.38, .38, .38)
# glTF importer maps +Y-up into Blender +Z-up.
model.location.z = .91 * .38
model['character_name'] = 'Fembot'
model['character_role'] = 'Cyborg assistant'
model['rig_contract'] = 'createBot-v1: keep pivots; host supplies physics and animation'

for obj in scene.objects:
    if obj.type == 'MESH':
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
        obj['asset'] = 'fembot'

# Keep the imported bind pose unchanged for safe re-export and host attachment.
# Set viewport material preview and aim it toward the character.
def material(name, color, metallic=0, roughness=.4):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    return mat

floor_mat = material('Studio charcoal', (.012, .019, .032), .4, .32)
bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.006))
floor = bpy.context.object
floor.name = 'Studio floor'
floor.data.materials.append(floor_mat)

def point_at(obj, target):
    obj.rotation_euler = (Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()

def area(name, location, color, energy, size, target=(0, 0, 1.1)):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = energy
    data.color = color
    data.shape = 'DISK'
    data.size = size
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = location
    point_at(obj, target)

area('Large warm key', (-3, -4, 5), (1, .83, .70), 650, 4)
area('Cool face fill', (3, -2, 2.8), (.5, .78, 1), 420, 3)
area('Cyan rim', (2, 2, 3), (.05, .6, 1), 850, 2.2)
area('Magenta rim', (-2, 1, 2.6), (.8, .12, .48), 700, 2)
area('Top reflection', (0, 0, 5), (1, .95, .86), 400, 2)
world = bpy.data.worlds.new('Fembot studio world')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (.06, .085, .14, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = .35
scene.world = world

data = bpy.data.cameras.new('Portrait camera')
camera = bpy.data.objects.new('Portrait camera', data)
scene.collection.objects.link(camera)
camera.location = (2.5, -6, 2.5)
point_at(camera, (0, 0, 1))
data.type = 'ORTHO'
data.ortho_scale = 2.5
scene.camera = camera
scene.render.engine = 'CYCLES'
scene.cycles.samples = 96
scene.cycles.use_denoising = True
scene.render.resolution_x = 1400
scene.render.resolution_y = 1800
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.film_transparent = False
scene.view_settings.view_transform = 'AgX'
scene.render.filepath = str(OUTPUT/'Fembot-preview.png')
# Stamp metadata writes the blend path into PNG tEXt chunks. Keep the preview free of machine paths.
scene.render.use_stamp = False
for flag in (
    'use_stamp_time', 'use_stamp_date', 'use_stamp_render_time', 'use_stamp_frame',
    'use_stamp_frame_range', 'use_stamp_memory', 'use_stamp_hostname', 'use_stamp_camera',
    'use_stamp_lens', 'use_stamp_scene', 'use_stamp_marker', 'use_stamp_filename',
    'use_stamp_note',
):
    if hasattr(scene.render, flag):
        setattr(scene.render, flag, False)
scene['asset_notes'] = 'Stylized reference interpretation. Host joint hierarchy is the animation rig; no replacement physics.'

if bpy.context.screen:
    for area_ui in bpy.context.screen.areas:
        if area_ui.type == 'VIEW_3D':
            area_ui.spaces.active.region_3d.view_perspective = 'CAMERA'
            area_ui.spaces.active.shading.type = 'MATERIAL'

bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT/'Fembot.blend'))
print('Fembot scene saved. Rendering preview...')
bpy.ops.render.render(write_still=True)
print('Fembot Blender preview saved.')
