// index.html から <script type="module"> の中身を取り出し、
// import をローカルの THREE モックに差し替えてテスト可能な .mjs を書き出す。
import fs from 'fs';

const html = fs.readFileSync('index.html', 'utf8');
const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!m) { console.error('FAIL: module script not found'); process.exit(1); }

let body = m[1];
body = body.replace(/import \* as THREE from ['"]three['"];?/, "import * as THREE from './mock_three.mjs';");
body = body.replace(/import \{ mergeGeometries \} from ['"]three\/addons\/utils\/BufferGeometryUtils\.js['"];?/,
  "import { mergeGeometries } from './mock_three.mjs';");

fs.writeFileSync('_extracted.mjs', body);

const EXPORTS = '{ world, CHAR_DEFS, CHAR_ORDER, startBattle, cleanupBattle, WORLD_R, LV_THRESH, ' +
  // v41 #186: 最大レベル / レベルアップの既定の伸び / HUD・オーブの更新
  'LV_MAX, LV_GROWTH_DEF, refreshHud, updateOrbs, ' +
  'zoneRadiusAt, Fighter, town, groundHeightAt, camera, buildCharacterMesh, buildCharCards, ' +
  'ULT_COST_BY, ultCostOf, SP_COST, skillCostOf, updateCamera, SEEK_SPEED, SEEK_LIFE, SEEK_MAIN, ASTRAL_LEASH, ASTRAL_SP_DRAIN, ' +
  'TOTAL_FIGHTERS, MOB_N, MOB_ACTIVE, MOB_HP, ASTRAL_CEIL, ASTRAL_FLOOR, CAM_DIST, ' +
  'SUPPLY_STOP_R, CAM_T_MIN, CAM_PAD, CAM_FOCUS_PULL, JAB_RANGE, AIM_ASSIST_DOT, ' +
  // (v34) AIM_TURN 撤去: 攻撃・構え中の向き直りは即時化
  'aimSoftTarget, cameraAimDir, spawnWorldOrb, rangeBar, ' +
  'SP_MAX, SP_EXHAUST_T, SP_KILL_BONUS, STAND_RUSH_MUL, ' +
  'BLOCK_DOT, BLOCK_SP_GAIN, ' +
  // v10: 本家スケール移植で入った定数
  'SP_REGEN, SP_REGEN_DELAY, SHIELD_MAX, SHIELD_START, ' +
  'SHIELD_ORB_GAIN, SHIELD_LV_GAIN, RUSH_COST_BY, rushCostOf, ' +
  'SEEK_SPLASH, ROLLER_MAIN, ROLLER_SPLASH, ' +
  // v11: 射程を伸ばしたときに壊れる場所を固定するための定数と関数
  // ★v98 #258: MELEE_UP_REACH は撤去(射程が球になり、高低差の門が消えた)
  'HIT_HALF_W, HIT_NEAR_R, aiHoldDist, aiSwingDist, AI_HOLD_K, AI_SWING_MARGIN, ' +
  'AI_RANGED_HOLD, AI_RANGED_SWING, ' +
  'GHOST_ARM, GHOST_LUNGE_K, GHOST_LUNGE_MIN, GHOST_LUNGE_MAX, GHOST_STRETCH_MAX, ' +
  // v37: 奥行き(遠いほど小さく・最大射程で消える) + スケール実寸化
  'GHOST_SCALE, GHOST_FAR_MIN, GHOST_FAR_FADE, ghostFarScale, ghostFarOpacity, ' +
  'STREAK_NEAR, STREAK_FAR, ' +
  // v38: 拳をエイムUI(丸)に一致させる幾何
  'aimRayTravel, aimScreenOffset, fighterAimRay, ' +
  // v39: 遮蔽(壁の向こうは殴れない)
  'segBoxHit, segBoxEnterT, sightClipT, boxesAlongSeg, sightBlocked, meleeBlocked, SIGHT_Y, SIGHT_EPS, ' +
  'SIGHT_MAX_TESTS, AI_BLOCK_PEN, AI_BLOCK_CHECK, addBox, SIGHT_MIN_HALF, pointInBox, buildBuildingGrid, ' +
  // v39: ヴェネツィアの町(運河・橋・三角屋根・店)
  'inWater, nearCanal, canalPushDir, WATER_Y, WATER_SPD, CURB_H, CURB_W, ' +
  // v40: 突き破って入る小窓(窓台をまたげる高さに) / 障害物ヒットの跡
  'WIN_SILL, WIN_TOP, WIN_HW, WIN_SHOP_Y0, addSill, winFrame, addGlass, breakGlass, stepOverOf, STEP_OVER, ' +
  // v41: 小窓の突き破り(近づくとボタン → モーションで室内へ)
  'VAULT_NEAR, VAULT_SIDE, VAULT_DY, VAULT_DUR, VAULT_IN, VAULT_ARC, ' +
  'addVaultWin, findVaultWindow, updateVault, clearVault, ' +
  // v41 #187: 振っている最中の狙い直し(回転速度の上限)
  'SWING_STEER, ' +
  'spawnWallMark, WALL_MARK_LIFE, updateFx, pushOut, ' +
  'addCanal, addBridge, BRIDGE_RAIL_MIN_H, bb, bbUpdate, bbReset, bbRecord, bbBlockers, BB_HOLD, BB_KEEP, BB_MOVE, UNSTUCK_T, UNSTUCK_MAX_R, trappedInGeometry, unstickFighter, updateUnstick, addGableRoof, addShop, addStall, SHOP_KINDS, finalizeBatches, ' +
  // v12: 瞬間移動 / 空気弾・仕込みの切り札
  // v43 #196: 力の片鱗の溜め / #194 ダッシュの2度倒し / #195 時間停止の波紋
  'BLINK_DIST, BLINK_STEP, BLINK_INVUL, BLINK_WIND, blinkScan, startBlink, updateBlink, clearBlink, ' +
  'DASH_TAP_T, stickTapOpen, stickTapDash, spawnTimeRipple, makeTsMark, updateTsMark, clearTsMark, ' +
  // v44 #200: 弾速・範囲奥義 / #199 落下奥義の狙いと殴り
  'SHOT_SPEED, BARRIER_R, BARRIER_N, ' +
  'ORB_VIEW_R, GLASS_VIEW_R, cullFarGlass, SHADOW_HALF, sun, updateSunShadow, renderer, QUALITY_STEPS, GFX_TOP, gfxMode, applyGfxMode, autoQuality, updatePerfHud, ROLLER_AIM_REACH, ROLLER_PUNCH, ROLLER_HIT_AT, rollerAimPoint, ' +
  // v44 #198: 止まった時の中へ割り込む
  'canBreakIntoTimeStop, breakIntoTimeStop, updateTsBreakIn, ' +
  // v45: 有志wikiのスキル表から入ったキャラ別のレベル効果
  'applyLvBonus, updateThermal, SHOT_DMG, SHOT_DMG_ASTRAL, ' +
  // v47: 小物のコライダーと「積んで登る」導線
  'JUMP_H, JUMP_VY, GRAVITY, CLIMB_RISE, CLIMB_HW, addClimbRoute, ' +
  // v48 #204 しゃがみ / #205 設定
  'CROUCH_SPD, CROUCH_SIGHT_Y, CROUCH_BLEND, CROUCH_CAM_DROP, sightYOf, ' +
  'BTN_IDS, ATK_BTN_R, applyBtnCfg, refreshPcHint, KEY_ACTIONS, KEY_ALIAS, defaultCfg, normalizeCfg, keyActionMap, clampBtnPos, ' +
  'loadCfg, saveCfg, CFG_KEY, keyLabel, cfgOpen, openCfg, closeCfg, ' +
  'addBarrel, addBench, addPlanter, addFence, addCrateStack, addCart, addBigTree, ' +
  'addTree, addLamp, addCafeSeats, addWellhead, addCrate, addGondola, findOpenSpot, ' +
  'TS_RIPPLE_N, TS_RIPPLE_GAP, TS_RIPPLE_R, TS_RIPPLE_LIFE, spawnRing, spawnPillar, ' +
  'spotFree, spotBlame, standOkAt, standSurfaceAt, STAND_OK_TOL, ' +   /* ★v231 #466: 棄却ログの「塞」で審判が呼ぶ */
  'SEEK_JUMP_VY, SEEK_JUMP_CD, explodeStalker, AIR_SPEED, AIR_LIFE, AIR_STEER, AIR_R, AIR_MAIN, AIR_EDGE, AIR_STUN, explodeAirBullet, ' +
  'AIR_RANGE, AIR_WALL_SLIDE, AIR_WALL_T, cancelAirBullet, ' +   // v144 #309 / v145 #310
  'RWND_REWIND, RWND_SAMPLE, RWND_HIST, rewindAllPositions, endTimeStop, ' +
  // v13: 時間停止(2秒・溜め・1試合1回) と 落下奥義
  // ★ここを足したら test_driver.mjs の分割代入も必ず同じだけ足す(登録簿は2つある)
  'TS_DUR, TS_WINDUP, TS_DUR_BY, TS_WINDUP_BY, tsDurOf, tsWindupOf, ROLLER_STUN, ROLLER_H, ROLLER_RISE, ROLLER_HANG, ROLLER_FALL, ROLLER_R, ' +
  'isTimeStopper, fireTimeStopUlt, startTimeStop, ' +
  'startRollerDive, finishRollerDive, clearRollerDive, updateRollerDive, ' +
  // v52 #212: 止まった時の中で落下点を狙う → 解除後に落として爆発
  'beginRollerAim, updateRollerAim, endRollerAim, ROLLER_DROP_FALL, ROLLER_DROP_HOLD, ' +
  'startRollerDrop, updateRollerDrop, clearRollerDrop, ROLLER_GHOST_OP, ' +
  'ROLLER_SLAM_T, ROLLER_SLAM_AT, ROLLER_SLAM_H, spawnRollerFist, removeRollerFist, updateRollerFist, bigRollerBlast, ' +
  'CAM_PITCH_MAX_SKY, camPitchMaxNow, ROLLER_CAM_DIST, ' +
  // v54: 落下奥義(消える→左スティックで選ぶ→0.3秒後に落ちる→瞬間移動)
  // ★v95 #255: ROLLER_STEP_UP は撤去(狙点の高さの門ごと無くなった)
  'ROLLER_AIM_SPD, ROLLER_DELAY, ROLLER_TP_LOCK, highestSurfaceAt, rollerAimInput, rollerAimStep, ' +
  'rollerTeleportBack, ROLLER_DIRECT, ROLLER_DIRECT_R, ROLLER_SHOCK, ROLLER_SHOCK_R, ' +
  'ROLLER_CORE_R, ROLLER_BLAST_R, ROLLER_TP_DELAY, ' +
  // v56: 体力1000 / シールドはマップから拾って1000max / 視点のぶれ止め
  'SHIELD_ORB_SMALL, SHIELD_ORB_LARGE, SHIELD_ORB_N, SHIELD_LARGE_RATE, CAM_STEP_SMOOTH, ' +
  'LABEL_OCCL_EVERY, LABEL_OCCL_MAX_D, updateLabels, MELEE_STEP_OVER, ' +
  // v14: 押しっぱなしブロッキング と 公式の消費精神力
  'BLOCK_DRAIN, BLOCK_MIN, BLOCK_AI_HOLD, ' +
  'SKILL_COST_BY, SKILL_LV2_DISCOUNT, SP_REGEN_DELAY_BY, spRegenDelayOf, ASTRAL_ENTER_COST, ' +
  // v15: 本家の構図(手前にスタンド/奥に本体)
  'GHOST_NEAR_BACK, GHOST_NEAR_SIDE, GHOST_NEAR_Y, GHOST_CAM_GAP, GHOST_FOE_R, GHOST_BACK_Y, GHOST_BACK_Y_CRAMP, GHOST_BACK_BOB, GHOST_BACK_SCALE, GHOST_BACK_OP, ' +
  'ghostNearOffset, ghostCamDist, nearestFoeDist, CAM_PITCH_DEF, ' +
  // v16: 攻撃スティック / 追尾弾の接触判定 / 設置爆弾
  // v42 #191: ATK_STICK_DEAD / atkStickDir / ATK_STICK_SENS / ATK_STICK_DEAD_PX は撤去
  //            (攻撃スティックは rotCam を直接叩くので、専用の感度も遊びも存在しない)
  'ATK_DRAG_R, atkStickTurn, SEEK_HIT_R, SEEK_HIT_DY, stalkerTouch, ' +
  // v40: 攻撃スティックを「倒し量に比例」へ(感度は視点ドラッグと同じ rad/px)
  'TRAP_REACH, TRAP_STEP, TRAP_FINE, TRAP_PROBE, TRAP_LIFE, TRAP_TRIGGER_R, TRAP_TRIGGER_DY, ' +
  'TRAP_MAIN, TRAP_SPLASH, TRAP_RADIUS, TRAP_CORE_R, TRAP_GUIDE_DOTS, TRAP_AI_CLEAR, trapSpot, plantTrapBomb, releaseTrapHold, bombLive, explodeBomb, ' +
  'TRAP_STUN, STICK_FUSE, STICK_MAIN, STICK_SPLASH, TRAP_PLANT_FX, ' +
  'bombAt, trapArcPoint, trapHandAt, TRAP_ARC_UP, TRAP_ARC_MIN, TRAP_TOSS_T, RANGED_FIRE_SIDE, updateBombs, ' +   // v77 #235
  'attachBomb, removeBomb, ' +                                                        // v142 #306
  // v49 #206-208: 構えの小走り / 弾のサブステップ / 設置爆弾の溜め
  'STAND_MOVE_MUL, ATTACK_MOVE_MUL, postureSpeedMul, AI_STAND_LEAD, ' +
  // ★updateProjectiles は下(swingTiming の並び)で既に出しているので、ここでは出さない
  'PROJ_SUBSTEP, PROJ_SUBSTEP_MAX, projSubsteps, spawnProjectile, ' +
  'SP_EXHAUST_BY, spExhaustOf, ' +      // v112 #276: 息切れの硬直(キャラ別)
  // v113 #276: オンラインの土台(種と状態の写し)
  'seedRandom, mulberry32, rnd, NET_TICK_HZ, snapshotWorld, applySnapshot, snapshotBytes, ' +
  'applyNetInput, updateAI, ' +      // v114 #277: ネット入力の継ぎ目
  // v115 #278: 時の消失(周囲だけが進む数秒)
  'startCrimson, crimsonOwner, inCrimson, updateCrimson, CRIMSON_T, CRIMSON_T6, CRIMSON_SLOW, ' +
  'VANISH_DRAIN, VANISH_BLINK, BLOCK_DRAIN_BY, blockDrainOf, zoneNextCircle, applyCrimsonView, ' +
  'endCrimson, CRIMSON_SKY, CRIMSON_C1, CRIMSON_C2, scene, ' +   /* v116 #278 */
  'net, netConnect, netDisconnect, netOnMessage, netStart, netEnd, netUrl, ' +   /* v116 #277 */
  'snapshotOrbs, applyOrbSnapshot, NET_PULL_Y, NET_SNAP_DIST_Y, showResult, refreshAlive, netSendInput, netApplySnapshots, netCheckOutcome, netLerpAngle, NET_LERP_MS, NET_SEND_HZ, NET_SNAP_DIST, ' +
  'LAG_HIST_T, LAG_MAX, lagOf, recordLagHistory, rewindFighters, restoreFighters, withRewind, ' +   /* v117 #280 */
  'VANISH_SP_GAIN, VANISH_SP_STEAL, startVanishWarp, ' +   /* v119 #282 */
  'SP_REGEN_STAND_DELAY, ' +   /* v122 #285 */
  'SOUL_DROP_MAX, soulDropCount, ENERGY_TRICKLE, ' +   /* v125 #288 */
  'visuallyHidden, applyHiddenLook, crimsonSoloView, esc, pushKillFeed, ' +   /* v127 #290 */
  'spawnGroundZipper, ' +   /* v128 #291 */
  'inDeepWater, submerged, DEEP_Y, BREATH_T, BREATH_REFILL, BREATH_MIN, buildTown, ' +   /* v129 #292 */
  'buildMapCards, chosenMapId, SEA_SURF_Y, SEA_BED_Y, FISH_Y, camInSea, ' +   /* v130 #293 */
  'GROUND_ORB_N, ROOF_ORB_N, addShip, ' +   /* v132 #295 */
  'spawnFish, spawnFishSchool, updateFish, hitFish, hitFishSeg, damageFish, removeFish, fishSpot, ' +
  'FISH_HP, FISH_HP_SHIELD, FISH_R, FISH_SHIELD_RATE, addSea, buildMinato, applySubmergeOffset, ' +
  'NET_F_ALIVE, NET_F_STAND, NET_F_CROUCH, NET_F_SWING, NET_F_ASTRAL, NET_F_GROUND, NET_F_DIVE, ' +

  // ★v94 #254: マップ4種
  'MAP_DEFS, mapDefOf, pickMapId, applyMapLook, addSkyBridge, addFlatBlock, addColumn, addMinaret, updatePads, ' +
  // v156 #321: 見た目=当たり判定の最終精査(単体で建てて測る)
  'addPier, addCrane, addSkiff, addPad, addQuay, addRoofHut, ' +
  // v110 #274: 上へ伸びる物の空き確認(高さも見る)
  'addStairsTo, structClear, structCandidates, overheadBox, ' +
  'addSeawall, SEAWALL_H, SEAWALL_W, meleeLineBlocked, ' +
  'buildVenezia, buildCairo, buildColosseo, buildSkyline, ' +
  'TRAP_HOLD_MIN, STAND_HOLD_MUL, trapHoldMinOf, blinkGuideWanted, updateBlinkGuide, inWindowOpening, SEEK_WIN_PAD, ' +
  'startBtdCut, updateBtdCut, btdCutPhase, RWND_CUT_HOLD, RWND_CUT_EYE, RWND_CUT_BOOM, RWND_CUT_BACK, RWND_CUT_TOTAL, ' +
  'SP_REGEN_STAND, SP_REGEN_BY, spRegenOf, ' +
  'spawnVolareBomb, updateVolare, explodeVolare, VOLARE_MAIN, VOLARE_EDGE, VOLARE_R, VOLARE_CORE_R, VOLARE_FIRE_DMG, VOLARE_FIRE_T, VOLARE_FIRE_R, ' +
  'isRangedChar, canAstralChar, BOMB_TIERS, BOMB_TIERS_ASTRAL, projDmgAt, SCAN_COST, SCAN_R, SCAN_T, standIsScan, ' +
  'astralHitAt, ASTRAL_HIT_R, removeEmeraldDome, spawnEmeraldField, updateEmeraldField, emeraldCenter, BARRIER_HIT, BARRIER_TICKS, BARRIER_T, BARRIER_EVERY, ' +
  'emeraldOf, cancelEmerald, BARRIER_DELAY, BARRIER_MOVE_MUL, ' +
  'ultUsesOf, ULT_RETRY_MAX, ' +   // v74 #232: 奥義は回数制(時間で回復しない)
  // v78 #237: 貫通 / 壁登り / 地面割り
  'pierceStrike, wallGripAt, canWallClimb, startWallClimb, endWallClimb, updateWallClimb, ' +
  'snapshotGlass, applyGlassSnapshot, reviveGlass, GLASS_GRACE_MS, snapshotEnergy, applyEnergySnapshot, netMirrorActions, netFeedback, netLogHit, netLogKill, evPack, evRow, isHuman, EV_BITS, EV_FLAG_MASK, NET_F_CLIMB, NET_F_BLOCK, aimDirOf, ' +   // v181 #394/#396/#397/#398
  'beginGroundAim, endGroundAim, fireGroundRush, updateGroundRush, groundRushBusy, updateGroundGuide, ' +
  'GRUSH_RATE, GRUSH_PIERCE, GRUSH_PIERCE_COST, GRUSH_PIERCE_RANGE, GRUSH_PIERCE_R, ' +
  'GRUSH_CLIMB_COST, GRUSH_CLIMB_DRAIN, GRUSH_CLIMB_SPD, GRUSH_CLIMB_NEAR, GRUSH_CLIMB_MAX, ' +
  'GRUSH_CLIMB_FAN, GRUSH_CLIMB_KICK, ' +   // v79 #238
  'GRUSH_ULT_AIM_T, GRUSH_ULT_AIM_R, GRUSH_ULT_AIM_SPD, GRUSH_ULT_T, GRUSH_ULT_HIT, ' +
  'GRUSH_ULT_TICKS, GRUSH_ULT_EVERY, GRUSH_ULT_R, GRUSH_ULT_STUN, ' +
  'GRUSH_ULT_WIND, GRUSH_ULT_ARMS, GRUSH_ULT_ARM_RATE, groundDive, ' +   // v79 #239
  // ★v81 #242: 追加5体(銃・剛腕・剣・炎・ジッパー)
  'SHOT_DMG_BY, SHOT_COST_BY, shotCostOf, SHOT_INTERVAL, SHOT_INTERVAL_BY, shotIntervalOf, ' +
  'SP_REGEN_STAND_BY, spRegenStandOf, explodeShotBoom, spawnFirePatch, ' +
  // v83 #244: 射手の系統を差し替え
  'GUN_SHOT, GUN_SHOT_HS, GUN_SHOT_COST, HEAD_HIT_Y, HEAD_HIT_R, ' +
  'SHOT_SPREAD, SHOT_SPREAD_AI, GUN_BASE_TIGHT, GUN_BLOOM_PER_SHOT, GUN_BLOOM_MAX, GUN_BLOOM_COOL, GUN_BLOOM_DELAY, horseBloomOf, horseSpreadMulOf, spreadScreenR, aimReticleScale, RETICLE_BASE_R, GUN_FLEE_T, GUN_FLEE_MUL, GUN_SHOT_SPEED, GUN_ULT_SPREAD, ' +
  'GUN_HOMING, GUN_HOMING_COST, GUN_HOMING_SPEED, GUN_HOMING_LIFE, GUN_HOMING_TURN, GUN_HOMING_R, ' +
  'GUN_ULT_WIND, GUN_ULT_T, GUN_ULT_HIT, GUN_ULT_SHOTS, GUN_ULT_EVERY, ' +
  'GUN_ULT_SPEED, GUN_ULT_RANGE, GUN_ULT_R, GUN_ULT_MOVE_MUL, ' +
  'beginHorseBarrage, horseBusy, cancelHorseBarrage, fireHorseBullet, updateHorseBarrage, ' +
  'GRIP_SCRAPE_COST, GRIP_SCRAPE_COST_ITEM, GRIP_SCRAPE_RANGE, GRIP_SCRAPE_PULL, ' +
  'GRIP_SCRAPE_KEEP, GRIP_SCRAPE_LIFT, GRIP_SCRAPE_STUN, GRIP_SCRAPE_ORB_KEEP, GRIP_RAGE_REGEN, ' +
  'GRIP_SCRAPE_HALF_W, GRIP_SCRAPE_NEAR_R, handScrapeReady, ' +   // v145 #310
  'WIRE_HOOK_COST, WIRE_HOOK_REACH, WIRE_HOOK_T, WIRE_HOOK_UP, WIRE_HOOK_LIP, WIRE_JAIL_DMG, WIRE_JAIL_STUN, WIRE_JAIL_R, ' +
  'hookSpotOf, hookGuideWanted, updateHookGuide, fireStringJail, ' +
  'ROPE_MAX_T, ROPE_HAND_Y, ROPE_MIN, ROPE_REEL, ROPE_PULL, ROPE_STEER, ROPE_KICK, ROPE_MAX_SPD, ROPE_AIR_DECAY, ' +
  'ropeBusy, endRopeSwing, updateRopeMesh, ' +
  'JAIL_OPEN_T, JAIL_R0, HOOK_SHOOT_T, HOOK_HOLD_T, HOOK_APEX_MIN, HOOK_CLEAR, hookReady, HOOK_OVER, HOOK_REGEN, hookMaxOf, startStoneHook, updateStoneHook, ' +   // v147 #312 / v149 #314
  'ACCEL_ACCEL_COST, ACCEL_ACCEL_T, ACCEL_ACCEL_MUL, ACCEL_ACCEL_REGEN, ACCEL_ULT_T, ACCEL_ULT_HIT, ' +
  'ACCEL_ULT_RATE, ACCEL_ULT_R, ACCEL_ULT_ZONE_MUL, ACCEL_ULT_PLANT_MUL, accelMaxOf, ' +
  'heavenOwner, heavenActive, startHeaven, endHeaven, updateHeaven, heavenShorten, ' +
  'ACCEL_ULT_WIND, ACCEL_ULT_UP, ACCEL_ULT_DOWN, ACCEL_TRAIL_EVERY, spawnBlurTrail, updateBlurTrail, ' +
  'makeHeavenDome, removeHeavenDome, buildHorseGhost, heavenRevealOnTimeStop, ULT_AIMED_IDS, blurTrailCount, blurTrailSpots, clearBlurTrail, ACCEL_CAM_PULL, ' +   // v146 #311 / v148 #313
  'GRIP_TOUGH_CUT, GRIP_RAGE_CUT, GRIP_RAGE_T, GRIP_RAGE_SHIELD, GRIP_RAGE_KNOCK, handScrape, damageCutOf, ' +
  'BLADE_RATE, BLADE_NEEDLE, BLADE_NEEDLE_N, BLADE_NEEDLE_WIND, BLADE_NEEDLE_T, ' +
  'BLADE_NEEDLE_EVERY, BLADE_NEEDLE_RANGE, BLADE_NEEDLE_R, BLADE_STAND_SPD, ' +
  'BLOCK_REFLECT_IDS, tryReflectShot, beginNeedles, needlesBusy, fireOneNeedle, updateNeedles, ' +
  'FLAME_CFH_DIRECT, FLAME_CFH_CORE, FLAME_CFH_EDGE, FLAME_CFH_R, FLAME_CFH_CORE_R, FLAME_CFH_COST, ' +
  'FLAME_CFH_SPEED, FLAME_FIRE_DMG, FLAME_FIRE_EVERY, FLAME_FIRE_T, FLAME_FIRE_ULT_T, FLAME_FIRE_R, ' +
  'FLAME_BIND, FLAME_BIND_COST, FLAME_BIND_STUN, FLAME_ULT_T, FLAME_ULT_SHOTS, FLAME_ULT_EVERY, ' +
  'FLAME_ULT_MOVE_MUL, beginFlameBarrage, flameBarrageBusy, updateFlameBarrage, ' +
  'ZIP_ZIP_COST, ZIP_ZIP_T, ZIP_ZIP_R, ZIP_ZIP_REACH, ZIP_DIVE_T, ZIP_DIVE_SPD, ' +
  'spawnZipper, removeZipper, inZipper, updateZippers, zipperSpotOf, ' +
  'startBucciDive, endBucciDive, updateBucciDive, bucciUnder, applyDiveOffset, hiddenFromFoes, ' +
  'ZIP_ZIP_STEP, ZIP_ZIP_MAX_THICK, ZIP_ZIP_MARGIN, inAnyBox, ' +
  // v109 #273: 貼ったら即・反対側へ / 壁の中からは殴れない
  'zipperThrough, inSolidWall, ' +
  'ZIP_DIVE_DEPTH, ZIP_DIVE_SINK_T, ZIP_DIVE_RISE_T, ZIP_DIVE_LOCK, ZIP_DIVE_MAX_Y, ' +
  // v82 #243: 往復は【射程に対する割合】
  'SWING_REF_RANGE, SWING_OUT_T, SWING_BACK_T, swingReachU, ' +
  // v73 #231: 技のキャンセル(×へドラッグ / ESC)
  'pendingCancelKind, cancelPendingAction, cancelHotAt, placeCancelTarget, refreshCancelTarget, setCancelHot, cancelBtnIdFor, CANCEL_HIT_R, CANCEL_GAP, ' +
  // v50 #209: C4式の設置(見ている面に貼る) / #210: シアハを狙って投げる
  'boxFaceNormal, aimSurface, TRAP_AIM_EPS, trapAimSpot, trapPlaceSpot, aimFighter, TRAP_BODY_R, plantBomb, ' +
  'trapGuideWanted, updateTrapGuide, makeTrapGuide, ' +
  'SEEK_THROW_SPEED, SEEK_THROW_UP, SEEK_THROW_STEP, SEEK_THROW_MAX_T, SEEK_THROW_R, SEEK_AI_THROW_MIN, ' +
  'shaThrowVel, shaThrowStep, shaThrowPath, shaThrowDir, spawnSheerHeart, updateStalkers, ' +
  'shaGuideWanted, updateShaGuide, ultIsAimed, ' +
  // v17: 前に出るブロッキング / 攻撃スティックの視点回転 / 上向き視点と床の寄せ
  'BLOCK_GHOST_FRONT, BLOCK_GHOST_SIDE, BLOCK_GHOST_Y, ' +
  'CAM_PITCH_MIN, CAM_PITCH_MAX, CAM_FLOOR_PAD, camFloorT, camFreeT, ' +
  // v18: 攻撃方向とカメラの連動(基準yawのラッチ + 背後への追従)
  //      ★v17の ATK_CAM_YAW / ATK_CAM_YAW_DEAD / atkStickCamYaw はここで撤去した。
  //        「倒し量で回す」と「向きへ追従する」は同時に成立しない(互いに打ち消し合う)。
  'camFollowYaw, ATK_CAM_FOLLOW, ATK_CAM_FOLLOW_MAX, ' +
  'ATK_CAM_STAND_MUL, ATK_CAM_TAIL, ATK_CAM_MANUAL, updatePlayer, rotCam, ' +
  // v19: 本家スクショの構図(若干左寄り・足先が見切れる・エイムUIは中央)を再現するレンズ
  'CAM_FOV, CAM_FOV_FOCUS, CAM_SHOULDER_NDC, CAM_SHOULDER_NDC_FOCUS, CAM_SHOULDER_Y, ' +
  //      ★CAM_DIST / CAM_FOCUS_PULL / camera / cameraAimDir は上の行で既に出しているので重ねない
  //        (同名を二度 export すると SyntaxError で丸ごと落ちる)。
  'camShoulderX, ' +
  // v20: 「一発ずつ狙って殴りに行く」3モーションの近接
  //      ★SP_COST / RUSH_COST_BY / rushCostOf / STAND_RUSH_MUL は上で既に出している
  'SWING_KINDS, SWING_T_MIN, SWING_T_MAX, SWING_DMG, SWING_BASE, ' +
  // v42 #192: SWING_SNAP(狙点の吸い付き)は廃止
  'SWING_COMBO_GRACE, SWING_PT_Y, SWING_TRAVEL_LERP, ' +
  // v21: 躍動感(緩急カーブ・体幹・ヒットストップ・残像)
  'SWING_COIL, SWING_COIL_END, SWING_OVERSHOOT, SWING_LERP_COIL, SWING_LERP_SETTLE, ' +
  'swingTravelAt, spawnStreak, fxList, ' +
  // v36: 腕と体でカーブを2本に割った(「殴る形のまま突っ込む」)
  'SWING_ARM_SNAP, swingArmAt, swingTailAt, ' +
  // v24: エイムサークル(丸の中だけ当たる)。★v98: SWING_PT_MAX 撤去(上限=射程)
  'AIM_CIRCLE_R, SWING_HIT_R, SWING_PT_MIN, ' +
  // v35: ラッシュを「拳の往復」で組み直した(SWING_T_PER_M / SWING_IMPACT / SWING_IMPACT_ON は廃止)
  'FIST_SPEED, FIST_BACK_SPEED, SWING_STARTUP, SWING_RECOVER, SWING_KIND_LAG, swingTiming, ' +
  // v35: 弾のノックバック撤廃を「弾を1発だけ進める」形で試験するため
  'updateProjectiles, ' +
  // v30: 本家wikiの通常攻撃の実数表
  'RUSH_DMG_BY, ' +
  // v27: スタンドのカメラ近接フェード
  'GHOST_FADE_NEAR, GHOST_FADE_FAR, GHOST_FADE_MIN, ' +
  // v28: バージョン表示
  'GAME_VERSION, ' +
  // v33: 完全ランダム安置 / 刺客 / ミニマップ秘匿
  'ZONE_KEYS, ZONE_DRIFT, buildZonePlan, zoneCenterAt, zoneDistTo, drawMinimap, ' +
  'SWING_BLINK_VIS, TEX_KIND_BY_COLOR, getTownTexture, WALL_PALETTE, ROOF_PALETTE, ' +
  // v34: 攻撃時半透明
  'GHOST_ATK_OP, ' +
  // ★v171 #343: ボタンのアイコン(利用者「言葉でいろいろやるよりアイコンをつけたほうがいい」)
  'ICONS, setBtnIcon, applyButtonIcons, refreshBtnIcon, jumpIconOf, skillIconOf, standIconOf, ' +
  'skillBadgeOf, ultBadgeOf, ' +
  // ★v171 #347: スキャンの「その時の居場所」の印
  'spawnScanMark, updateScanMarks, clearScanMarks, SCAN_MARK_T, SCAN_MARK_Y, SCAN_MARK_R, ' +
  // ★v171 #349: 広告(忍者AdMax)
  'ADS, adReady, mountAd, unmountAd, ' +
  // ★v171 #351: キャラ選択カード(名前を出さない)
  'diffStars, DIFF_MAX, ' +
  // ★v171 #352/#353: 時止めはレベルで伸びる / モノクロの波
  'TS_DUR_LV, TS_WAVE_N, TS_WAVE_R, TS_WAVE_LIFE, spawnTsWaves, updateTsWaves, clearTsWaves, ' +
  // ★v171 #355-#359: 独壇場の固定 / ゆっくり巻き戻し / 赤い床 / 色抜き
  'horseLockDir, removeHorseGlow, beginBtdRewind, stepBtdRewind, finalizeBtdRewind, ' +
  'removeGroundWarn, updateTsChargeFx, ' +
  // ★v171 #367: アナウンスの門
  'announce, announceQueue, ANNOUNCE_ZONE_ONLY, WIRE_JAIL_RANGE, ' +
  // ★v171 #378: 英語対応
  'tr, setLang, applyLang, EN_DICT, walkTranslate, ASTRAL_CAM_PULL }';   // ★SCAN_COST/SCAN_R/SCAN_T は上で既に出している
const testable = body.replace('//__TEST_EXPORT__', `export ${EXPORTS};`);
if (testable === body) { console.error('FAIL: //__TEST_EXPORT__ sentinel missing'); process.exit(1); }
fs.writeFileSync('_extracted_testable.mjs', testable);

// 健全性チェック: 閉じタグの重複がないこと
const closes = (html.match(/<\/html>/g) || []).length;
const scripts = (html.match(/<\/script>/g) || []).length;
console.log(`built: ${body.length} chars, </html>x${closes}, </script>x${scripts}`);
if (closes !== 1) { console.error('FAIL: duplicated </html>'); process.exit(1); }
