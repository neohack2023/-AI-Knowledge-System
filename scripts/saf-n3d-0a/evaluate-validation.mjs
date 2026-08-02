export function evaluateSpatialValidation(profile, report) {
  const blockers = [];
  const warnings = [];

  if (!profile.applies_to.roles.includes(report.components[0]?.role)) warnings.push('PROFILE_ROLE_REVIEW');
  if (!profile.applies_to.representations.includes(report.representation_family)) blockers.push('PROFILE_REPRESENTATION_MISMATCH');
  if (report.components.length > profile.geometry_rules.max_components) blockers.push('MAX_COMPONENTS_EXCEEDED');

  for (const component of report.components) {
    if (component.units !== profile.geometry_rules.units) blockers.push(`UNITS_MISMATCH:${component.component_id}`);
    if (component.coordinate_system !== profile.geometry_rules.coordinate_system) blockers.push(`COORDINATE_SYSTEM_MISMATCH:${component.component_id}`);
    if (component.vertex_count > profile.geometry_rules.max_vertices) blockers.push(`MAX_VERTICES_EXCEEDED:${component.component_id}`);
    if (component.face_count > profile.geometry_rules.max_faces) blockers.push(`MAX_FACES_EXCEEDED:${component.component_id}`);
    if (component.degenerate_faces > 0) blockers.push(`DEGENERATE_FACES:${component.component_id}`);
    if (component.zero_area_faces > 0) blockers.push(`ZERO_AREA_FACES:${component.component_id}`);
    if (component.flipped_normals > 0) warnings.push(`FLIPPED_NORMALS:${component.component_id}`);

    const required = profile.geometry_rules.watertight_requirement === 'REQUIRED' || component.watertight_requirement === 'REQUIRED';
    if (required && component.watertight_result !== 'PASS') blockers.push(`WATERTIGHT_REQUIRED:${component.component_id}`);
    if (component.watertight_result === 'REVIEW_REQUIRED') warnings.push(`WATERTIGHT_REVIEW:${component.component_id}`);
  }

  if (profile.geometry_rules.require_reimport && report.export_reimport.reimport_result !== 'PASS') blockers.push('REIMPORT_REQUIRED');
  if (report.export_reimport.export_result === 'FAIL') blockers.push('EXPORT_FAILED');
  if (report.export_reimport.structural_digest_match === false) blockers.push('STRUCTURAL_DIGEST_MISMATCH');

  const uvRequirement = profile.material_rules.uv_requirement;
  if (uvRequirement === 'REQUIRED' && !report.materials.uv_present) blockers.push('UV_REQUIRED');
  if (report.materials.uv_overlap_result === 'FAIL') blockers.push('UV_OVERLAP_FAILED');
  if (report.materials.translation_loss.length > 0) warnings.push('MATERIAL_TRANSLATION_LOSS');

  if (profile.rig_rules.requirement === 'REQUIRED' && report.rig.state !== 'PASS') blockers.push('RIG_REQUIRED');
  if (report.rig.state === 'FAIL') blockers.push('RIG_FAILED');
  if (report.rig.state === 'HUMAN_REVIEW_REQUIRED') warnings.push('RIG_REVIEW_REQUIRED');

  if (!profile.rights_rules.accepted_states.includes(report.rights.state)) blockers.push('RIGHTS_STATE_NOT_ACCEPTED');
  if (report.rights.distribution === 'BLOCKED') blockers.push('DISTRIBUTION_BLOCKED');

  const reviewRequired = profile.human_review.required || report.human_review.requirement === 'REQUIRED';
  const reviewComplete = report.human_review.state === 'COMPLETE';
  if (reviewRequired && !reviewComplete) warnings.push('HUMAN_REVIEW_PENDING');

  const technicalOutcome = blockers.length > 0
    ? 'FAIL'
    : warnings.length > 0
      ? 'CONDITIONAL_PASS'
      : 'PASS';

  const acceptanceEligible = blockers.length === 0 && (!reviewRequired || reviewComplete);
  return {
    technical_outcome: technicalOutcome,
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
    human_review_required: reviewRequired,
    acceptance_eligible: acceptanceEligible,
  };
}

export function assertDerivedValidation(profile, report) {
  const derived = evaluateSpatialValidation(profile, report);
  if (report.technical_outcome !== derived.technical_outcome) {
    throw new Error(`TECHNICAL_OUTCOME_MISMATCH: declared ${report.technical_outcome}, derived ${derived.technical_outcome}`);
  }
  if (report.acceptance.state === 'ACCEPTED_AS_CANDIDATE' && !derived.acceptance_eligible) {
    throw new Error('ACCEPTANCE_NOT_ELIGIBLE');
  }
  return derived;
}
