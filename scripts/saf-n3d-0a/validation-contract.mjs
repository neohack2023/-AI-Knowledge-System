import { object, equal, stableId, string, array, integer, boolean, oneOf, required, vector3, fail } from './common.mjs';

export function validateValidationProfile(value) {
  object(value, '$');
  equal(value.contract, 'SpatialValidationProfile/0.1', '$.contract');
  stableId(value.profile_id, '$.profile_id');
  string(value.version, '$.version');
  object(value.applies_to, '$.applies_to');
  array(value.applies_to.roles, '$.applies_to.roles', 1, 20);
  array(value.applies_to.representations, '$.applies_to.representations', 1, 20);
  object(value.geometry_rules, '$.geometry_rules');
  equal(value.geometry_rules.units, 'm', '$.geometry_rules.units');
  equal(value.geometry_rules.coordinate_system, 'RIGHT_HANDED_Y_UP_NEGATIVE_Z_FORWARD', '$.geometry_rules.coordinate_system');
  for (const key of ['max_vertices','max_faces','max_components']) integer(value.geometry_rules[key], `$.geometry_rules.${key}`, 1);
  oneOf(value.geometry_rules.watertight_requirement, ['REQUIRED','NOT_REQUIRED','COMPONENT_SPECIFIC'], '$.geometry_rules.watertight_requirement');
  boolean(value.geometry_rules.require_reimport, '$.geometry_rules.require_reimport');
  object(value.material_rules, '$.material_rules');
  object(value.rig_rules, '$.rig_rules');
  object(value.human_review, '$.human_review');
  object(value.rights_rules, '$.rights_rules');
  return value;
}

export function validateValidationReport(value) {
  object(value, '$');
  equal(value.contract, 'SpatialValidationReport/0.1', '$.contract');
  stableId(value.execution_id, '$.execution_id');
  stableId(value.candidate_id, '$.candidate_id');
  oneOf(value.representation_family, ['MESH_ASSET_DRAFT','GAUSSIAN_SPLAT_CAPTURE','PROCEDURAL_MESH_SOURCE','RIGGED_CHARACTER_DRAFT'], '$.representation_family');
  stableId(value.validation_profile_id, '$.validation_profile_id');
  array(value.components, '$.components', 1, 512);
  for (const [index, component] of value.components.entries()) validateComponent(component, `$.components[${index}]`);
  object(value.export_reimport, '$.export_reimport');
  oneOf(value.export_reimport.export_result, ['PASS','FAIL','NOT_RUN'], '$.export_reimport.export_result');
  oneOf(value.export_reimport.reimport_result, ['PASS','FAIL','NOT_RUN'], '$.export_reimport.reimport_result');
  object(value.materials, '$.materials');
  object(value.rig, '$.rig');
  object(value.rights, '$.rights');
  oneOf(value.technical_outcome, ['PASS','CONDITIONAL_PASS','FAIL','HUMAN_REVIEW_REQUIRED'], '$.technical_outcome');
  object(value.human_review, '$.human_review');
  oneOf(value.human_review.requirement, ['REQUIRED','NOT_REQUIRED'], '$.human_review.requirement');
  oneOf(value.human_review.state, ['PENDING','COMPLETE','NOT_APPLICABLE'], '$.human_review.state');
  if (value.human_review.requirement === 'REQUIRED' && value.human_review.state === 'NOT_APPLICABLE') {
    fail('HUMAN_REVIEW_STATE_MISMATCH', 'Required review cannot be NOT_APPLICABLE.', '$.human_review.state');
  }
  object(value.acceptance, '$.acceptance');
  oneOf(value.acceptance.state, ['PENDING','ACCEPTED_AS_CANDIDATE','REJECTED','SUPERSEDED','ARCHIVED'], '$.acceptance.state');
  equal(value.acceptance.assigned_destination, 'CANDIDATE_ASSET_PACKAGE', '$.acceptance.assigned_destination');
  if (value.human_review.requirement === 'REQUIRED' && value.human_review.state !== 'COMPLETE' && value.acceptance.state === 'ACCEPTED_AS_CANDIDATE') {
    fail('PREMATURE_ACCEPTANCE', 'Candidate cannot be accepted before required human review completes.', '$.acceptance.state');
  }
  return value;
}

function validateComponent(value, path) {
  object(value, path);
  for (const key of ['component_id','role','topology_family','units','coordinate_system','bounds','dimensions','vertex_count','face_count','connected_components','degenerate_faces','zero_area_faces','non_manifold_edges','flipped_normals','self_intersections','watertight_requirement','watertight_observed','watertight_result']) required(value, key, path);
  stableId(value.component_id, `${path}.component_id`);
  equal(value.units, 'm', `${path}.units`);
  equal(value.coordinate_system, 'RIGHT_HANDED_Y_UP_NEGATIVE_Z_FORWARD', `${path}.coordinate_system`);
  vector3(value.dimensions, `${path}.dimensions`);
  object(value.bounds, `${path}.bounds`);
  vector3(value.bounds.min, `${path}.bounds.min`);
  vector3(value.bounds.max, `${path}.bounds.max`);
  for (const key of ['vertex_count','face_count','connected_components','degenerate_faces','zero_area_faces','non_manifold_edges','flipped_normals']) integer(value[key], `${path}.${key}`, 0);
  if (value.self_intersections !== null) integer(value.self_intersections, `${path}.self_intersections`, 0);
  oneOf(value.watertight_requirement, ['REQUIRED','NOT_REQUIRED','COMPONENT_SPECIFIC'], `${path}.watertight_requirement`);
  boolean(value.watertight_observed, `${path}.watertight_observed`);
  oneOf(value.watertight_result, ['PASS','FAIL','NOT_APPLICABLE','REVIEW_REQUIRED'], `${path}.watertight_result`);
}
