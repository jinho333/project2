package com.commit.project2.controller;

import com.commit.project2.service.RegionService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Controller;

@Controller
@RequiredArgsConstructor
public class RegionController {
  private final RegionService regionService;


}
